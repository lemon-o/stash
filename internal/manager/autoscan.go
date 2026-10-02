package manager

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/stashapp/stash/internal/manager/config"
	"github.com/stashapp/stash/pkg/file"
	"github.com/stashapp/stash/pkg/logger"
)

type AutoScanManager struct {
	mgr     *Manager
	watcher *fsnotify.Watcher
	watched map[string]bool
	watchMu sync.Mutex

	stopCh chan struct{}
	wg     sync.WaitGroup

	debounceMu    sync.Mutex
	debounceTimer *time.Timer
	pendingPaths  map[string]bool

	lastScanTime time.Time
}

func NewAutoScanManager(mgr *Manager) *AutoScanManager {
	return &AutoScanManager{
		mgr:          mgr,
		watched:      make(map[string]bool),
		pendingPaths: make(map[string]bool),
		stopCh:       make(chan struct{}),
		lastScanTime: time.Now(),
	}
}

func (a *AutoScanManager) Start() {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		logger.Warnf("[AutoScan] Could not initialize filesystem watcher: %v. Running in periodic polling mode only.", err)
	} else {
		a.watcher = watcher
		a.refreshWatches()
		a.wg.Add(1)
		go a.watchLoop()
	}

	a.wg.Add(1)
	go a.pollLoop()

	a.wg.Add(1)
	go a.listenScanComplete()

	logger.Infof("[AutoScan] Automatic library scanning service started (Jellyfin-like real-time monitoring enabled).")
}

func (a *AutoScanManager) listenScanComplete() {
	defer a.wg.Done()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sub := a.mgr.ScanSubscribe(ctx)
	for {
		select {
		case <-a.stopCh:
			return
		case _, ok := <-sub:
			if !ok {
				return
			}
			a.lastScanTime = time.Now()
		}
	}
}

func (a *AutoScanManager) refreshWatches() {
	if a.watcher == nil {
		return
	}

	stashPaths := a.mgr.Config.GetStashPaths().Paths()
	for _, root := range stashPaths {
		if _, err := os.Stat(root); err != nil {
			continue
		}
		a.addWatchRecursive(root)
	}
}

func (a *AutoScanManager) addWatchRecursive(root string) {
	if a.watcher == nil {
		return
	}
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if file.IsIgnoredSystemOrThumbnailPath(path) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			a.addWatch(path)
		}
		return nil
	})
}

func (a *AutoScanManager) addWatch(dir string) {
	a.watchMu.Lock()
	defer a.watchMu.Unlock()

	if a.watched[dir] {
		return
	}

	if err := a.watcher.Add(dir); err != nil {
		logger.Debugf("[AutoScan] Could not watch directory %q: %v", dir, err)
		return
	}
	a.watched[dir] = true
}

func (a *AutoScanManager) watchLoop() {
	defer a.wg.Done()

	for {
		select {
		case <-a.stopCh:
			return
		case event, ok := <-a.watcher.Events:
			if !ok {
				return
			}

			// Ignore system / thumbnail junk (e.g. @eaDir, SYNOFILE_THUMB, etc.)
			if file.IsIgnoredSystemOrThumbnailPath(event.Name) {
				continue
			}

			// If a new directory was created, watch it recursively
			if event.Op.Has(fsnotify.Create) {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					a.addWatchRecursive(event.Name)
					a.scheduleScan(event.Name)
					continue
				}
			}

			// Check if relevant file operation
			if event.Op.Has(fsnotify.Create) || event.Op.Has(fsnotify.Write) || event.Op.Has(fsnotify.Rename) || event.Op.Has(fsnotify.Remove) {
				if useAsVideo(event.Name) || useAsImage(event.Name) || isZip(event.Name) {
					a.scheduleScan(event.Name)
				}
			}

		case err, ok := <-a.watcher.Errors:
			if !ok {
				return
			}
			logger.Debugf("[AutoScan] Watcher error: %v", err)
		}
	}
}

func (a *AutoScanManager) scheduleScan(path string) {
	a.debounceMu.Lock()
	defer a.debounceMu.Unlock()

	dir := filepath.Dir(path)
	a.pendingPaths[dir] = true

	if a.debounceTimer != nil {
		a.debounceTimer.Stop()
	}

	// 10 second debounce to wait for file writing / copying to complete
	a.debounceTimer = time.AfterFunc(10*time.Second, func() {
		a.onDebounceTimer()
	})
}

func (a *AutoScanManager) onDebounceTimer() {
	a.debounceMu.Lock()
	if len(a.pendingPaths) == 0 {
		a.debounceMu.Unlock()
		return
	}
	if a.isScanRunning() {
		a.debounceTimer = time.AfterFunc(5*time.Second, func() {
			a.onDebounceTimer()
		})
		a.debounceMu.Unlock()
		return
	}

	var paths []string
	for p := range a.pendingPaths {
		paths = append(paths, p)
	}
	a.pendingPaths = make(map[string]bool)
	a.debounceMu.Unlock()

	logger.Infof("[AutoScan] Detected file system changes. Automatically triggering scan...")
	a.triggerScan(paths)
}

func (a *AutoScanManager) pollLoop() {
	defer a.wg.Done()

	intervalSec := a.mgr.Config.GetAutoScanInterval()
	if intervalSec <= 0 {
		intervalSec = 300
	}
	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.stopCh:
			return
		case <-ticker.C:
			// 1. Refresh watches for any newly created subdirectories
			a.refreshWatches()

			// 2. Check if any new or modified files exist since lastScanTime
			if a.hasNewOrModifiedFiles(a.lastScanTime) {
				if !a.isScanRunning() {
					logger.Infof("[AutoScan] Periodic check detected new/modified files since %s. Starting scan...", a.lastScanTime.Format("15:04:05"))
					a.triggerScan(nil)
				}
			}
		}
	}
}

func (a *AutoScanManager) hasNewOrModifiedFiles(since time.Time) bool {
	stashPaths := a.mgr.Config.GetStashPaths().Paths()
	for _, root := range stashPaths {
		var found bool
		_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if file.IsIgnoredSystemOrThumbnailPath(path) {
				if d.IsDir() {
					return fs.SkipDir
				}
				return nil
			}
			if d.IsDir() {
				return nil
			}
			if !useAsVideo(path) && !useAsImage(path) && !isZip(path) {
				return nil
			}

			info, err := d.Info()
			if err != nil {
				return nil
			}

			if info.ModTime().After(since) {
				found = true
				return fs.SkipAll
			}
			return nil
		})

		if found {
			return true
		}
	}
	return false
}

func (a *AutoScanManager) isScanRunning() bool {
	if a.mgr.JobManager == nil {
		return false
	}
	for _, j := range a.mgr.JobManager.GetQueue() {
		if strings.HasPrefix(j.Description, "Scanning") {
			return true
		}
	}
	return false
}

func (a *AutoScanManager) triggerScan(paths []string) {
	if a.isScanRunning() {
		return
	}

	cfg := a.mgr.Config
	defSettings := cfg.GetDefaultScanSettings()

	var scanInput ScanMetadataInput
	if defSettings != nil {
		scanInput = ScanMetadataInput{
			Paths:               paths,
			ScanMetadataOptions: *defSettings,
		}
	} else {
		scanInput = ScanMetadataInput{
			Paths: paths,
			ScanMetadataOptions: config.ScanMetadataOptions{
				ScanGenerateCovers:        true,
				ScanGeneratePreviews:      true,
				ScanGenerateThumbnails:    true,
				ScanGenerateImagePreviews: false,
				ScanGenerateSprites:       false,
				ScanGeneratePhashes:       false,
			},
		}
	}

	a.lastScanTime = time.Now()
	_, err := a.mgr.Scan(context.Background(), scanInput)
	if err != nil {
		logger.Errorf("[AutoScan] Failed to start scan: %v", err)
	}
}

func (a *AutoScanManager) Stop() {
	select {
	case <-a.stopCh:
		return
	default:
		close(a.stopCh)
	}

	a.debounceMu.Lock()
	if a.debounceTimer != nil {
		a.debounceTimer.Stop()
	}
	a.debounceMu.Unlock()

	if a.watcher != nil {
		_ = a.watcher.Close()
	}

	a.wg.Wait()
	logger.Info("[AutoScan] Automatic library scanning service stopped.")
}
