package generate

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"

	"github.com/stashapp/stash/pkg/ffmpeg/transcoder"
	"github.com/stashapp/stash/pkg/fsutil"
	"github.com/stashapp/stash/pkg/logger"
)

const (
	// thumbnailWidth   = 320
	// thumbnailQuality = 5

	screenshotQuality = 2

	screenshotDurationProportion = 0.2
)

type ScreenshotOptions struct {
	At *float64
}

type frameQuality struct {
	avgY       float64
	stddevY    float64
	minY       float64
	maxY       float64
	isUnusable bool
	score      float64
}

func evaluateFrameImage(data []byte) frameQuality {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return frameQuality{isUnusable: true}
	}

	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w <= 0 || h <= 0 {
		return frameQuality{isUnusable: true}
	}

	// Uniform grid sampling (up to 50x50 = 2500 samples max for lightning fast analysis)
	stepX := w / 50
	if stepX < 1 {
		stepX = 1
	}
	stepY := h / 50
	if stepY < 1 {
		stepY = 1
	}

	var sumY, sumSqY float64
	var count int
	minY := 255.0
	maxY := 0.0

	for y := bounds.Min.Y; y < bounds.Max.Y; y += stepY {
		for x := bounds.Min.X; x < bounds.Max.X; x += stepX {
			r, g, b, _ := img.At(x, y).RGBA()
			lum := 0.299*float64(r>>8) + 0.587*float64(g>>8) + 0.114*float64(b>>8)

			sumY += lum
			sumSqY += lum * lum
			if lum < minY {
				minY = lum
			}
			if lum > maxY {
				maxY = lum
			}
			count++
		}
	}

	if count == 0 {
		return frameQuality{isUnusable: true}
	}

	avgY := sumY / float64(count)
	variance := (sumSqY / float64(count)) - (avgY * avgY)
	if variance < 0 {
		variance = 0
	}
	stddevY := math.Sqrt(variance)

	// Black frame: average brightness too low or maximum brightness still very dark
	isBlack := (avgY < 20.0 && maxY < 45.0) || avgY < 15.0
	// Blank/Solid frame: no variance or contrast (flat solid color e.g. white, grey, black)
	isBlank := stddevY < 6.0 || (maxY-minY) < 15.0

	// Exposure weighting: prefer comfortably lit frames
	exposureWeight := 1.0
	if avgY < 40.0 {
		exposureWeight = math.Max(0.1, avgY/40.0)
	} else if avgY > 220.0 {
		exposureWeight = math.Max(0.1, (255.0-avgY)/35.0)
	}

	score := stddevY * exposureWeight
	if isBlack || isBlank {
		score = 0
	}

	return frameQuality{
		avgY:       avgY,
		stddevY:    stddevY,
		minY:       minY,
		maxY:       maxY,
		isUnusable: isBlack || isBlank,
		score:      score,
	}
}

func getCandidateTimestamps(videoDuration float64, requestedAt *float64) []float64 {
	var candidates []float64
	seen := make(map[int]bool)

	addTime := func(t float64) {
		if t < 0 {
			t = 0
		}
		if videoDuration > 0 && t >= videoDuration {
			t = math.Max(0, videoDuration-0.5)
		}
		// Quantize to 0.1s to avoid near duplicates
		key := int(t * 10)
		if !seen[key] {
			seen[key] = true
			candidates = append(candidates, t)
		}
	}

	if requestedAt != nil {
		addTime(*requestedAt)
	}

	if videoDuration <= 0 {
		for _, t := range []float64{0.0, 1.0, 2.0, 5.0, 10.0} {
			addTime(t)
		}
		return candidates
	}

	if videoDuration <= 15.0 {
		for _, ratio := range []float64{0.30, 0.50, 0.20, 0.70, 0.40, 0.60, 0.80, 0.10} {
			addTime(ratio * videoDuration)
		}
		for _, sec := range []float64{1.0, 2.0, 0.5, 3.0} {
			if sec < videoDuration {
				addTime(sec)
			}
		}
	} else {
		for _, ratio := range []float64{0.20, 0.40, 0.60, 0.70, 0.50, 0.30, 0.80, 0.15, 0.10} {
			addTime(ratio * videoDuration)
		}
	}

	return candidates
}

func (g Generator) Screenshot(ctx context.Context, input string, videoWidth int, videoDuration float64, options ScreenshotOptions) ([]byte, error) {
	lockCtx := g.LockManager.ReadLock(ctx, input)
	defer lockCtx.Cancel()

	logger.Infof("Creating screenshot for %s", input)

	candidates := getCandidateTimestamps(videoDuration, options.At)

	var bestData []byte
	var bestScore float64 = -1
	var firstData []byte

	for idx, at := range candidates {
		ret, err := g.generateBytes(lockCtx, g.ScenePaths, jpgPattern, g.screenshot(input, screenshotOptions{
			Time:    at,
			Quality: screenshotQuality,
			// default Width is video width
		}))
		if err != nil {
			logger.Debugf("[generator] failed to capture frame at %.2fs for %s: %v", at, input, err)
			continue
		}

		if firstData == nil {
			firstData = ret
		}

		fq := evaluateFrameImage(ret)
		// If frame is bright, sharp and comfortable exposure, accept immediately!
		if !fq.isUnusable && fq.avgY >= 40.0 && fq.score >= 25.0 {
			if idx > 0 {
				logger.Infof("[generator] selected optimal non-black frame at %.2fs for %s (avg=%.1f, stddev=%.1f, score=%.1f)", at, input, fq.avgY, fq.stddevY, fq.score)
			}
			return ret, nil
		}

		if fq.score > bestScore {
			bestScore = fq.score
			bestData = ret
		}

		if fq.isUnusable {
			logger.Debugf("[generator] frame at %.2fs for %s is black/blank (avg=%.1f, stddev=%.1f), searching alternative...", at, input, fq.avgY, fq.stddevY)
		}
	}

	if bestData != nil && bestScore > 0 {
		logger.Infof("[generator] selected best non-black frame for %s (score=%.1f)", input, bestScore)
		return bestData, nil
	}

	if firstData != nil {
		return firstData, nil
	}

	return nil, fmt.Errorf("unable to generate any screenshot for %s", input)
}

type screenshotOptions struct {
	Time    float64
	Width   int
	Quality int
}

func (g Generator) screenshot(input string, options screenshotOptions) generateFn {
	return func(lockCtx *fsutil.LockContext, tmpFn string) error {
		ssOptions := transcoder.ScreenshotOptions{
			OutputPath: tmpFn,
			OutputType: transcoder.ScreenshotOutputTypeImage2,
			Quality:    options.Quality,
			Width:      options.Width,
		}

		args := transcoder.ScreenshotTime(input, options.Time, ssOptions)
		if err := g.generate(lockCtx, args); err != nil {
			logger.Warnf("[generator] fast screenshot seek failed for %s at %.3fs, retrying with accurate seek: %v", input, options.Time, err)

			ssOptions.SlowSeek = true
			args = transcoder.ScreenshotTime(input, options.Time, ssOptions)
			return g.generate(lockCtx, args)
		}

		return nil
	}
}
