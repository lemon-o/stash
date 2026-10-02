package manager

import (
	"context"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/stashapp/stash/internal/manager/config"
	"github.com/stashapp/stash/pkg/file"
	"github.com/stashapp/stash/pkg/job"
	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/sqlite"
)

type AutoScanManager struct {
	mgr     *Manager
	watcher *fsnotify.Watcher
	watched map[string]bool
	watchMu sync.Mutex

	stopCh chan struct{}
	wg     sync.WaitGroup

	debounceMu     sync.Mutex
	debounceTimer  *time.Timer
	pendingChanges bool

	scanMu sync.Mutex
}

func NewAutoScanManager(mgr *Manager) *AutoScanManager {
	return &AutoScanManager{
		mgr:     mgr,
		watched: make(map[string]bool),
		stopCh:  make(chan struct{}),
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

	// Initial startup check: scans if there are unindexed or modified files on startup
	a.wg.Add(1)
	go a.startupCheck()

	logger.Infof("[AutoScan] Automatic library scanning service started (real-time monitoring + periodic polling enabled).")
}

func (a *AutoScanManager) startupCheck() {
	defer a.wg.Done()

	select {
	case <-a.stopCh:
		return
	case <-time.After(5 * time.Second):
	}

	if a.isScanRunning() {
		return
	}

	logger.Infof("[AutoScan] Running startup library check...")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if changed, err := a.hasChanges(ctx); err != nil {
		logger.Debugf("[AutoScan] Startup check error: %v", err)
	} else if changed {
		logger.Infof("[AutoScan] Startup check detected unscanned/modified files. Starting automatic scan...")
		a.triggerScan(nil)
	} else {
		logger.Infof("[AutoScan] Startup check complete: all files are up to date.")
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
					a.scheduleScan()
					continue
				}
			}

			// Check if relevant file operation
			if event.Op.Has(fsnotify.Create) || event.Op.Has(fsnotify.Write) || event.Op.Has(fsnotify.Rename) || event.Op.Has(fsnotify.Remove) {
				if useAsVideo(event.Name) || useAsImage(event.Name) || isZip(event.Name) {
					a.scheduleScan()
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

func (a *AutoScanManager) scheduleScan() {
	a.debounceMu.Lock()
	defer a.debounceMu.Unlock()

	a.pendingChanges = true

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
	if !a.pendingChanges {
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

	a.pendingChanges = false
	a.debounceMu.Unlock()

	logger.Infof("[AutoScan] Detected filesystem changes via watcher. Automatically triggering scan...")
	a.triggerScan(nil)
}

func (a *AutoScanManager) pollLoop() {
	defer a.wg.Done()

	intervalSec := a.mgr.Config.GetAutoScanInterval()
	if intervalSec <= 0 {
		intervalSec = 60
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

			// 2. Check if any new, modified, or deleted files exist
			if !a.isScanRunning() {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
				if changed, err := a.hasChanges(ctx); err != nil {
					logger.Debugf("[AutoScan] Periodic check error: %v", err)
				} else if changed {
					logger.Infof("[AutoScan] Periodic check detected library changes. Automatically starting scan...")
					a.triggerScan(nil)
				}
				cancel()
			}
		}
	}
}

func (a *AutoScanManager) hasChanges(ctx context.Context) (bool, error) {
	if a.mgr.Database == nil || a.mgr.Database.File == nil {
		return false, nil
	}

	stashPaths := a.mgr.Config.GetStashPaths().Paths()
	if len(stashPaths) == 0 {
		return false, nil
	}

	basics, err := a.mgr.Database.File.GetAllFileBasics(ctx, stashPaths)
	if err != nil {
		return false, err
	}

	knownFiles := make(map[string]sqlite.FileBasicInfo, len(basics))
	for _, b := range basics {
		knownFiles[filepath.Clean(b.Path)] = b
	}

	diskCount := 0
	hasDiff := false

	for _, root := range stashPaths {
		if _, err := os.Stat(root); err != nil {
			continue
		}

		_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil || ctx.Err() != nil {
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
			if info.Size() == 0 {
				return nil
			}

			diskCount++
			cleanPath := filepath.Clean(path)
			dbItem, exists := knownFiles[cleanPath]
			if !exists {
				logger.Infof("[AutoScan] Detected unindexed file on disk: %s", path)
				hasDiff = true
				return filepath.SkipAll
			}

			// Check if file was modified (size differs or mtime differs by more than 2 seconds)
			if info.Size() != dbItem.Size || math.Abs(info.ModTime().Sub(dbItem.ModTime).Seconds()) > 2 {
				logger.Infof("[AutoScan] Detected modified file on disk: %s", path)
				hasDiff = true
				return filepath.SkipAll
			}

			return nil
		})

		if hasDiff {
			return true, nil
		}
	}

	if diskCount < len(knownFiles) {
		logger.Infof("[AutoScan] Detected file deletion (disk: %d, db: %d)", diskCount, len(knownFiles))
		return true, nil
	}

	return false, nil
}

func (a *AutoScanManager) isScanRunning() bool {
	if a.mgr.JobManager == nil {
		return false
	}
	for _, j := range a.mgr.JobManager.GetQueue() {
		if strings.HasPrefix(j.Description, "Scanning") && (j.Status == job.StatusRunning || j.Status == job.StatusReady) {
			return true
		}
	}
	return false
}

func (a *AutoScanManager) triggerScan(paths []string) {
	a.scanMu.Lock()
	defer a.scanMu.Unlock()

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
