package file

import (
	"testing"
)

func TestIsIgnoredSystemOrThumbnailPath(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		// Synology NAS
		{"/volume1/media/@eaDir", true},
		{"/volume1/media/@eaDir/test.jpg/SYNOFILE_THUMB_S.jpg", true},
		{"/volume1/media/@eaDir/test.jpg/SYNOFILE_THUMB_M.jpg", true},
		{"/volume1/media/@eaDir/test.jpg/SYNOFILE_THUMB_L.jpg", true},
		{"/volume1/media/@eaDir/test.jpg/SYNOPHOTO_THUMB_S.jpg", true},
		{"/volume1/media/@eaDir/test.jpg/SYNOPHOTO_THUMB_XL.jpg", true},
		{"SYNOFILE_THUMB_S.jpg", true},
		{"synofile_thumb_m.jpg", true},
		{"synophoto_thumb_s.jpg", true},
		{"@eaDir", true},
		{"/volume1/video/#recycle/movie.mp4", true},
		{"/volume1/video/@recycle/movie.mp4", true},

		// macOS
		{"._image.jpg", true},
		{"/volume1/media/__MACOSX/._pic.jpg", true},
		{".DS_Store", true},
		{"/volume1/media/.DS_Store", true},
		{"/volume1/.Spotlight-V100/file", true},
		{"/volume1/.Trashes/file", true},

		// Windows
		{"Thumbs.db", true},
		{"/volume1/media/Thumbs.db", true},
		{"$RECYCLE.BIN/deleted.mp4", true},
		{"System Volume Information/file", true},

		// Linux / QNAP
		{"/volume1/media/.thumbnails/thumb.png", true},
		{"/volume1/media/.@__thumb/thumb.png", true},
		{".nomedia", true},

		// Legitimate media files
		{"/volume1/media/vacation/photo.jpg", false},
		{"/volume1/media/movie.mp4", false},
		{"/volume1/media/collection/poster.png", false},
		{"normal_photo.jpeg", false},
	}

	for _, tt := range tests {
		actual := IsIgnoredSystemOrThumbnailPath(tt.path)
		if actual != tt.expected {
			t.Errorf("IsIgnoredSystemOrThumbnailPath(%q) = %v; expected %v", tt.path, actual, tt.expected)
		}
	}
}
