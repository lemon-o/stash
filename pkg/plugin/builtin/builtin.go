package builtin

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/stashapp/stash/pkg/fsutil"
	"github.com/stashapp/stash/pkg/logger"
)

//go:embed auto_group/*
var BuiltinPlugins embed.FS

// ProvisionDefaultPlugins ensures that built-in plugins (like auto_group)
// are extracted to the user's plugin directory so they can be executed by python.
func ProvisionDefaultPlugins(pluginsDir string) error {
	if pluginsDir == "" {
		return nil
	}

	if err := fsutil.EnsureDir(pluginsDir); err != nil {
		return err
	}

	return fs.WalkDir(BuiltinPlugins, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if path == "." {
			return nil
		}

		targetPath := filepath.Join(pluginsDir, path)

		if d.IsDir() {
			return fsutil.EnsureDir(targetPath)
		}

		// Read content from embedded FS
		data, err := BuiltinPlugins.ReadFile(path)
		if err != nil {
			return err
		}

		// If file exists with same size, skip writing to avoid unnecessary I/O
		if info, err := os.Stat(targetPath); err == nil {
			if info.Size() == int64(len(data)) {
				return nil
			}
		}

		logger.Infof("Extracting built-in plugin file: %s -> %s", path, targetPath)
		if err := os.WriteFile(targetPath, data, 0755); err != nil {
			logger.Errorf("Failed to write built-in plugin file %s: %v", targetPath, err)
			return err
		}

		return nil
	})
}
