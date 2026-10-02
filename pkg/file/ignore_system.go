package file

import (
	"path/filepath"
	"strings"
)

var ignoredDirNames = map[string]bool{
	// Synology NAS
	"@eadir":                    true,
	".@eadir":                   true,
	"#recycle":                  true,
	"@recycle":                  true,

	// QNAP NAS
	".@__thumb":                 true,

	// macOS
	"__macosx":                  true,
	".spotlight-v100":           true,
	".trashes":                  true,
	".fseventsd":                true,
	".temporaryitems":           true,

	// Linux / Android
	".thumbnails":               true,

	// Windows
	"$recycle.bin":              true,
	"system volume information": true,
}

var ignoredFileNames = map[string]bool{
	".ds_store":         true,
	"thumbs.db":         true,
	"ehthumbs.db":       true,
	"ehthumbs_vista.db": true,
	"desktop.ini":       true,
	".nomedia":          true,
}

// IsIgnoredSystemOrThumbnailPath returns true if the path belongs to a NAS, OS,
// or indexing thumbnail/junk directory (like Synology @eaDir) or matches system thumbnail filenames.
func IsIgnoredSystemOrThumbnailPath(path string) bool {
	if path == "" {
		return false
	}

	cleanPath := filepath.ToSlash(filepath.Clean(path))
	parts := strings.Split(cleanPath, "/")

	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			continue
		}
		lower := strings.ToLower(part)
		if ignoredDirNames[lower] {
			return true
		}
	}

	base := filepath.Base(path)
	lowerBase := strings.ToLower(base)

	if ignoredFileNames[lowerBase] {
		return true
	}

	// AppleDouble files created by macOS on network shares (e.g. ._photo.jpg)
	if strings.HasPrefix(base, "._") {
		return true
	}

	// Synology thumbnail and stream cache files
	upperBase := strings.ToUpper(base)
	if strings.HasPrefix(upperBase, "SYNOFILE_THUMB_") ||
		strings.HasPrefix(upperBase, "SYNOPHOTO_THUMB_") ||
		strings.HasPrefix(upperBase, "SYNOPHOTO_FILM_") ||
		strings.HasPrefix(upperBase, "@SYNOEASTREAM") {
		return true
	}

	return false
}
