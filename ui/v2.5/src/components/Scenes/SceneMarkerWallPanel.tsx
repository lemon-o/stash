import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Form } from "react-bootstrap";
import * as GQL from "src/core/generated-graphql";
import Gallery, {
  GalleryI,
  PhotoProps,
  RenderImageProps,
} from "react-photo-gallery";
import { useConfigurationContext } from "src/hooks/Config";
import { objectTitle } from "src/core/files";
import { Link, useHistory } from "react-router-dom";
import { TruncatedText } from "../Shared/TruncatedText";
import TextUtils from "src/utils/text";
import { useDragMoveSelect } from "../Shared/GridCard/dragMoveSelect";
import cx from "classnames";
import NavUtils from "src/utils/navigation";
import { markerTitle } from "src/core/markers";
import {
  getFirstValidPreviewSource,
  PreviewMediaType,
} from "src/utils/wallPreview";

function wallItemTitle(sceneMarker: GQL.SceneMarkerDataFragment) {
  const newTitle = markerTitle(sceneMarker);
  const seconds = TextUtils.formatTimestampRange(
    sceneMarker.seconds,
    sceneMarker.end_seconds ?? undefined
  );
  if (newTitle) {
    return `${newTitle} - ${seconds}`;
  } else {
    return seconds;
  }
}

interface IMarkerPhoto {
  marker: GQL.SceneMarkerDataFragment;
  link: string;
  mediaType: PreviewMediaType;
  onError?: (photo: PhotoProps<IMarkerPhoto>) => void;
}

interface IExtraProps {
  maxHeight: number;
  selected?: boolean;
  onSelectedChanged?: (selected: boolean, shiftKey: boolean) => void;
  selecting?: boolean;
}

export const MarkerWallItem: React.FC<
  RenderImageProps<IMarkerPhoto> & IExtraProps
> = (props: RenderImageProps<IMarkerPhoto> & IExtraProps) => {
  const { dragProps } = useDragMoveSelect({
    selecting: props.selecting || false,
    selected: props.selected || false,
    onSelectedChanged: props.onSelectedChanged,
  });

  const { configuration } = useConfigurationContext();
  const playSound = configuration?.interface.soundOnPreview ?? false;

  const [active, setActive] = useState(false);

  const height = Math.min(props.maxHeight, props.photo.height);
  const zoomFactor = height / props.photo.height;
  const width = props.photo.width * zoomFactor;

  type style = Record<string, string | number | undefined>;
  var divStyle: style = {
    margin: props.margin,
    display: "block",
  };

  if (props.direction === "column") {
    divStyle.position = "absolute";
    divStyle.left = props.left;
    divStyle.top = props.top;
  }

  function handleClick(event: React.MouseEvent) {
    if (props.selecting && props.onSelectedChanged) {
      props.onSelectedChanged(!props.selected, event.shiftKey);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (props.onClick) {
      props.onClick(event, { index: props.index });
    }
  }

  const video = props.photo.mediaType === "video";
  const { marker } = props.photo;
  const poster = marker.screenshot ?? undefined;

  const [isPlaying, setIsPlaying] = useState(false);
  const videoEl = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!video || !videoEl.current) return;
    if (active) {
      videoEl.current.play().catch(() => {});
    } else {
      setIsPlaying(false);
      videoEl.current.pause();
      videoEl.current.currentTime = 0;
    }
  }, [active, video]);

  const title = wallItemTitle(marker);
  const tagNames = marker.tags.map((p) => p.name);

  let shiftKey = false;

  return (
    <div
      className="wall-item"
      role="button"
      onClick={handleClick}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      {...dragProps}
      style={{
        ...divStyle,
        width,
        height,
      }}
    >
      {props.onSelectedChanged && (
        <Form.Control
          type="checkbox"
          className="wall-item-check mousetrap"
          checked={props.selected}
          onChange={() => props.onSelectedChanged!(!props.selected, shiftKey)}
          onClick={(event: React.MouseEvent<HTMLInputElement, MouseEvent>) => {
            shiftKey = event.shiftKey;
            event.stopPropagation();
          }}
        />
      )}
      {/* 静态缩略图封面（始终作为底层基准，鼠标未悬停或移开时立即展示，彻底避免黑帧） */}
      <img
        loading="lazy"
        src={video ? (poster || props.photo.src) : props.photo.src}
        alt={props.photo.alt}
        width={width}
        height={height}
        style={{
          width,
          height,
          objectFit: "cover",
          display: "block",
        }}
      />
      {/* 悬停预览视频（仅在开始播放后显现，移出时立即隐藏恢复为静态封面） */}
      {video && (
        <video
          loop
          muted={!playSound || !active}
          autoPlay={false}
          poster={poster}
          preload="none"
          playsInline
          key={props.photo.key}
          src={props.photo.src}
          width={width}
          height={height}
          ref={videoEl}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            objectFit: "cover",
            opacity: isPlaying ? 1 : 0,
            pointerEvents: "none",
            transition: isPlaying ? "opacity 0.2s ease" : "none",
          }}
          onPlaying={() => {
            if (active) {
              setIsPlaying(true);
            }
          }}
          onError={() => {
            setIsPlaying(false);
            props.photo.onError?.(props.photo);
          }}
        />
      )}
      <div className="lineargradient">
        <footer className="wall-item-footer">
          <Link to={props.photo.link} onClick={(e) => e.stopPropagation()}>
            {title && (
              <TruncatedText
                text={title}
                lineCount={1}
                className="wall-item-title"
              />
            )}
            <TruncatedText text={tagNames.join(", ")} />
          </Link>
        </footer>
      </div>
    </div>
  );
};

interface IMarkerWallProps {
  markers: GQL.SceneMarkerDataFragment[];
  zoomIndex: number;
  selectedIds?: Set<string>;
  onSelectChange?: (id: string, selected: boolean, shiftKey: boolean) => void;
  selecting?: boolean;
}

// HACK: typescript doesn't allow Gallery to accept a parameter for some reason
const MarkerGallery = Gallery as unknown as GalleryI<IMarkerPhoto>;

function getMarkerPreviewSources(
  marker: GQL.SceneMarkerDataFragment,
  previewType?: string | null
) {
  if (previewType === "image") {
    return [{ src: marker.screenshot, mediaType: "image" }] as const;
  }

  if (previewType === "animation") {
    return [
      { src: marker.preview, mediaType: "image" },
      { src: marker.screenshot, mediaType: "image" },
    ] as const;
  }

  return [
    { src: marker.stream, mediaType: "video" },
    { src: marker.screenshot, mediaType: "image" },
  ] as const;
}

interface IFile {
  width: number;
  height: number;
}

function getDimensions(file?: IFile) {
  const defaults = { width: 1280, height: 720 };

  if (!file) return defaults;

  return {
    width: file.width || defaults.width,
    height: file.height || defaults.height,
  };
}

const breakpointZoomHeights = [
  { minWidth: 576, heights: [100, 120, 240, 360] },
  { minWidth: 768, heights: [120, 160, 240, 480] },
  { minWidth: 1200, heights: [120, 160, 240, 300] },
  { minWidth: 1400, heights: [160, 240, 300, 480] },
];

type FailedSrcMap = Record<string, string[]>; // markerID to list of failed srcs

const MarkerWall: React.FC<IMarkerWallProps> = ({
  markers,
  zoomIndex,
  selectedIds,
  onSelectChange,
  selecting,
}) => {
  const history = useHistory();
  const { configuration } = useConfigurationContext();
  const previewType = configuration?.interface.wallPlayback;

  const containerRef = React.useRef<HTMLDivElement>(null);

  const margin = 3;
  const direction = "row";

  const [erroredImgs, setErroredImgs] = useState<FailedSrcMap>({});

  const handleError = useCallback(
    (markerID: string, photo: PhotoProps<IMarkerPhoto>) => {
      setErroredImgs((prev) => ({
        ...prev,
        [markerID]: [...(prev[markerID] || []), photo.src],
      }));
    },
    []
  );

  useEffect(() => {
    const ret: FailedSrcMap = {};
    markers.forEach((m) => {
      ret[m.id] = [];
    });
    setErroredImgs(ret);
  }, [markers]);

  const photos: PhotoProps<IMarkerPhoto>[] = useMemo(() => {
    return markers.map((m, index) => {
      const { width = 1280, height = 720 } = getDimensions(m.scene.files[0]);

      return {
        marker: m,
        ...getFirstValidPreviewSource(
          getMarkerPreviewSources(m, previewType),
          erroredImgs[m.id] || []
        ),
        link: NavUtils.makeSceneMarkerUrl(m),
        width,
        height,
        tabIndex: index,
        key: m.id,
        loading: "lazy",
        alt: objectTitle(m),
        onError: (photo: PhotoProps<IMarkerPhoto>) => handleError(m.id, photo),
      };
    });
  }, [markers, previewType, erroredImgs, handleError]);

  const onClick = useCallback(
    (_event, { index }) => {
      history.push(photos[index].link);
    },
    [history, photos]
  );

  function columns(containerWidth: number) {
    const preferredSize = 300;
    const columnCount = containerWidth / preferredSize;
    return Math.round(columnCount);
  }

  const targetRowHeight = useCallback(
    (containerWidth: number) => {
      let zoomHeight = 280;
      breakpointZoomHeights.forEach((e) => {
        if (containerWidth >= e.minWidth) {
          zoomHeight = e.heights[zoomIndex];
        }
      });
      return zoomHeight;
    },
    [zoomIndex]
  );

  // set the max height as a factor of the targetRowHeight
  // this allows some images to be taller than the target row height
  // but prevents images from becoming too tall when there is a small number of items
  const maxHeightFactor = 1.3;

  const renderImage = useCallback(
    (props: RenderImageProps<IMarkerPhoto>) => {
      const markerId = props.photo.marker.id;
      return (
        <MarkerWallItem
          {...props}
          maxHeight={
            targetRowHeight(containerRef.current?.offsetWidth ?? 0) *
            maxHeightFactor
          }
          selected={selectedIds?.has(markerId)}
          onSelectedChanged={
            onSelectChange
              ? (selected, shiftKey) =>
                  onSelectChange(markerId, selected, shiftKey)
              : undefined
          }
          selecting={selecting}
        />
      );
    },
    [targetRowHeight, selectedIds, onSelectChange, selecting]
  );

  return (
    <div className="marker-wall" ref={containerRef}>
      {photos.length ? (
        <MarkerGallery
          photos={photos}
          renderImage={renderImage}
          onClick={onClick}
          margin={margin}
          direction={direction}
          columns={columns}
          targetRowHeight={targetRowHeight}
        />
      ) : null}
    </div>
  );
};

interface IMarkerWallPanelProps {
  markers: GQL.SceneMarkerDataFragment[];
  zoomIndex: number;
  selectedIds?: Set<string>;
  onSelectChange?: (id: string, selected: boolean, shiftKey: boolean) => void;
}

export const MarkerWallPanel: React.FC<IMarkerWallPanelProps> = ({
  markers,
  zoomIndex,
  selectedIds,
  onSelectChange,
}) => {
  const selecting = !!selectedIds && selectedIds.size > 0;
  return (
    <MarkerWall
      markers={markers}
      zoomIndex={zoomIndex}
      selectedIds={selectedIds}
      onSelectChange={onSelectChange}
      selecting={selecting}
    />
  );
};
