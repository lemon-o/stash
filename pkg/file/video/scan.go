package video

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	stashExec "github.com/stashapp/stash/pkg/exec"
	"github.com/stashapp/stash/pkg/ffmpeg"
	"github.com/stashapp/stash/pkg/file"
	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
)

// Decorator adds video specific fields to a File.
type Decorator struct {
	FFMpeg  *ffmpeg.FFMpeg
	FFProbe *ffmpeg.FFProbe
}

func isMpegTsFile(filePath string) bool {
	f, err := os.Open(filePath)
	if err != nil {
		return false
	}
	defer f.Close()

	buf := make([]byte, 1)
	if n, err := f.Read(buf); err == nil && n == 1 {
		return buf[0] == 0x47 // 0x47 is the MPEG-TS Sync Byte ('G')
	}
	return false
}

func shouldAutoHeal(filePath string, container ffmpeg.Container, probeContainer string) bool {
	ext := strings.ToLower(filepath.Ext(filePath))
	// Detect files named .mp4 / .m4v that are actually MPEG-TS or FLV
	if ext == ".mp4" || ext == ".m4v" {
		if container == ffmpeg.Mpegts || probeContainer == "mpegts" || probeContainer == "flv" || isMpegTsFile(filePath) {
			return true
		}
	}
	return false
}

func autoHealVideo(ctx context.Context, ffmpegTool *ffmpeg.FFMpeg, filePath string) error {
	var ffmpegPath string
	if ffmpegTool != nil {
		ffmpegPath = ffmpegTool.Path()
	}
	if ffmpegPath == "" {
		ffmpegPath = ffmpeg.ResolveFFMpeg("", "")
	}
	if ffmpegPath == "" {
		return errors.New("ffmpeg executable not found")
	}

	tempPath := filePath + ".tmp_autoheal.mp4"
	bakPath := filePath + ".bak_autoheal"

	_ = os.Remove(tempPath)
	_ = os.Remove(bakPath)

	logger.Infof("[AutoHeal] Detected malformed container/stream for %s. Auto-repairing to faststart MP4...", filePath)

	cmd := stashExec.CommandContext(ctx, ffmpegPath,
		"-y",
		"-v", "error",
		"-i", filePath,
		"-c", "copy",
		"-movflags", "+faststart",
		tempPath,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("ffmpeg remux failed: %v, output: %s", err, string(output))
	}

	fi, err := os.Stat(tempPath)
	if err != nil || fi.Size() == 0 {
		_ = os.Remove(tempPath)
		return fmt.Errorf("ffmpeg produced empty output: %w", err)
	}

	// Safe atomic replacement on Windows/Linux:
	if err := os.Rename(filePath, bakPath); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("failed to backup original file: %w", err)
	}

	if err := os.Rename(tempPath, filePath); err != nil {
		_ = os.Rename(bakPath, filePath)
		_ = os.Remove(tempPath)
		return fmt.Errorf("failed to move repaired file into place: %w", err)
	}

	_ = os.Remove(bakPath)

	logger.Infof("[AutoHeal] Successfully auto-repaired %s (new size: %d bytes)", filePath, fi.Size())
	return nil
}

func (d *Decorator) Decorate(ctx context.Context, fs models.FS, f models.File) (models.File, error) {
	if d.FFProbe == nil {
		return f, errors.New("ffprobe not configured")
	}

	base := f.Base()
	// TODO - copy to temp file if not an OsFS
	if _, isOs := fs.(*file.OsFS); !isOs {
		return f, fmt.Errorf("video.constructFile: only OsFS is supported")
	}

	probe := d.FFProbe
	videoFile, err := probe.NewVideoFile(base.Path)
	if err != nil {
		return f, fmt.Errorf("running ffprobe on %q: %w", base.Path, err)
	}

	container, err := ffmpeg.MatchContainer(videoFile.Container, base.Path)
	if err != nil {
		return f, fmt.Errorf("matching container for %q: %w", base.Path, err)
	}

	// 🎯 AutoHeal: Check if this file has a malformed container or stream (e.g. MPEG-TS disguised as MP4)
	if shouldAutoHeal(base.Path, container, videoFile.Container) {
		if err := autoHealVideo(ctx, d.FFMpeg, base.Path); err != nil {
			logger.Warnf("[AutoHeal] Skipping auto-repair for %s: %v", base.Path, err)
		} else {
			if newFi, statErr := os.Stat(base.Path); statErr == nil {
				base.Size = newFi.Size()
				base.ModTime = newFi.ModTime()
			}
			if newVideoFile, probeErr := probe.NewVideoFile(base.Path); probeErr == nil {
				videoFile = newVideoFile
				if newContainer, matchErr := ffmpeg.MatchContainer(videoFile.Container, base.Path); matchErr == nil {
					container = newContainer
				}
			}
		}
	}

	// check if there is a funscript file
	interactive := false
	if _, err := fs.Lstat(GetFunscriptPath(base.Path)); err == nil {
		interactive = true
	}

	return &models.VideoFile{
		BaseFile:    base,
		Format:      string(container),
		VideoCodec:  videoFile.VideoCodec,
		AudioCodec:  videoFile.AudioCodec,
		Width:       videoFile.Width,
		Height:      videoFile.Height,
		Duration:    videoFile.FileDuration,
		FrameRate:   videoFile.FrameRate,
		BitRate:     videoFile.Bitrate,
		Interactive: interactive,
	}, nil
}

func (d *Decorator) IsMissingMetadata(ctx context.Context, fs models.FS, f models.File) bool {
	const (
		unsetString = "unset"
		unsetNumber = -1
	)

	vf, ok := f.(*models.VideoFile)
	if !ok {
		return true
	}

	ext := strings.ToLower(filepath.Ext(vf.Base().Path))
	if (ext == ".mp4" || ext == ".m4v") && (vf.Format == "mpegts" || vf.Format == "ts" || isMpegTsFile(vf.Base().Path)) {
		return true
	}

	interactive := false
	if _, err := fs.Lstat(GetFunscriptPath(vf.Base().Path)); err == nil {
		interactive = true
	}

	return vf.VideoCodec == unsetString || vf.AudioCodec == unsetString ||
		vf.Format == unsetString || vf.Width == unsetNumber ||
		vf.Height == unsetNumber || vf.FrameRate == unsetNumber ||
		vf.Duration == unsetNumber ||
		vf.BitRate == unsetNumber || interactive != vf.Interactive
}
