import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { Icon } from "src/components/Shared/Icon";
import {
  faSearch,
  faTimes,
  faChevronDown,
  faPlayCircle,
  faUser,
  faTag,
  faVideo,
  faFilm,
  faImages,
  faImage,
  faGlobe,
  faMapMarkerAlt,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import Mousetrap from "mousetrap";
import { objectTitle } from "src/core/files";
import { PatchComponent } from "src/patch";
import NavUtils from "src/utils/navigation";
import TextUtils from "src/utils/text";

interface ISearchCategory {
  key: string;
  label: string;
  path: string;
  icon: any;
  placeholder: string;
}

const CATEGORIES: ISearchCategory[] = [
  {
    key: "all",
    label: "全局",
    path: "/scenes",
    icon: faGlobe,
    placeholder: "全局搜索短片、图片、集合、标记、图库、演员、工作室、标签... (按 / 聚焦)",
  },
  {
    key: "scenes",
    label: "短片",
    path: "/scenes",
    icon: faPlayCircle,
    placeholder: "搜索短片视频标题、详情、文件名... (按 / 聚焦)",
  },
  {
    key: "images",
    label: "图片",
    path: "/images",
    icon: faImage,
    placeholder: "搜索图片... (按 / 聚焦)",
  },
  {
    key: "groups",
    label: "集合",
    path: "/groups",
    icon: faFilm,
    placeholder: "搜索系列、合集、电影... (按 / 聚焦)",
  },
  {
    key: "markers",
    label: "标记",
    path: "/scenes/markers",
    icon: faMapMarkerAlt,
    placeholder: "搜索视频场景标记... (按 / 聚焦)",
  },
  {
    key: "galleries",
    label: "图库",
    path: "/galleries",
    icon: faImages,
    placeholder: "搜索图库相册... (按 / 聚焦)",
  },
  {
    key: "performers",
    label: "演员",
    path: "/performers",
    icon: faUser,
    placeholder: "搜索演员姓名、别名... (按 / 聚焦)",
  },
  {
    key: "studios",
    label: "工作室",
    path: "/studios",
    icon: faVideo,
    placeholder: "搜索工作室/制片厂... (按 / 聚焦)",
  },
  {
    key: "tags",
    label: "标签",
    path: "/tags",
    icon: faTag,
    placeholder: "搜索标签... (按 / 聚焦)",
  },
];

export const FrontPageSearchBar: React.FC = PatchComponent(
  "FrontPageSearchBar",
  () => {
    const history = useHistory();
    const intl = useIntl();

    const [term, setTerm] = useState("");
    const [debouncedTerm, setDebouncedTerm] = useState("");
    const [categoryKey, setCategoryKey] = useState("all");
    const [activeDropdownTab, setActiveDropdownTab] = useState("all");
    const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const activeCategory =
      CATEGORIES.find((c) => c.key === categoryKey) ?? CATEGORIES[0];

    // Debounce search term for suggestions
    useEffect(() => {
      const timer = setTimeout(() => {
        const trimmed = term.trim();
        setDebouncedTerm(trimmed);
        setActiveDropdownTab("all");
      }, 250);
      return () => clearTimeout(timer);
    }, [term]);

    // 1. Scenes query
    const scenesResult = GQL.useFindScenesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: categoryKey === "scenes" ? 12 : 4,
          q: debouncedTerm,
        },
      },
      skip:
        !debouncedTerm || (categoryKey !== "all" && categoryKey !== "scenes"),
    });

    // 2. Images query
    const imagesResult = GQL.useFindImagesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: categoryKey === "images" ? 12 : 4,
          q: debouncedTerm,
        },
      },
      skip:
        !debouncedTerm || (categoryKey !== "all" && categoryKey !== "images"),
    });

    // 3. Groups query
    const groupsResult = GQL.useFindGroupsQuery({
      variables: {
        filter: {
          page: 1,
          per_page: categoryKey === "groups" ? 12 : 4,
          q: debouncedTerm,
        },
      },
      skip:
        !debouncedTerm || (categoryKey !== "all" && categoryKey !== "groups"),
    });

    // 4. Scene Markers query
    const markersResult = GQL.useFindSceneMarkersQuery({
      variables: {
        filter: {
          page: 1,
          per_page: categoryKey === "markers" ? 12 : 4,
          q: debouncedTerm,
        },
      },
      skip:
        !debouncedTerm || (categoryKey !== "all" && categoryKey !== "markers"),
    });

    // 5. Galleries query
    const galleriesResult = GQL.useFindGalleriesQuery({
      variables: {
        filter: {
          page: 1,
          per_page: categoryKey === "galleries" ? 12 : 4,
          q: debouncedTerm,
        },
      },
      skip:
        !debouncedTerm ||
        (categoryKey !== "all" && categoryKey !== "galleries"),
    });

    // 6. Performers query
    const performersResult = GQL.useFindPerformersQuery({
      variables: {
        filter: {
          page: 1,
          per_page: categoryKey === "performers" ? 12 : 4,
          q: debouncedTerm,
        },
      },
      skip:
        !debouncedTerm ||
        (categoryKey !== "all" && categoryKey !== "performers"),
    });

    // 7. Studios query
    const studiosResult = GQL.useFindStudiosQuery({
      variables: {
        filter: {
          page: 1,
          per_page: categoryKey === "studios" ? 12 : 4,
          q: debouncedTerm,
        },
      },
      skip:
        !debouncedTerm || (categoryKey !== "all" && categoryKey !== "studios"),
    });

    // 8. Tags query
    const tagsResult = GQL.useFindTagsForListQuery({
      variables: {
        filter: {
          page: 1,
          per_page: categoryKey === "tags" ? 16 : 8,
          q: debouncedTerm,
        },
      },
      skip:
        !debouncedTerm || (categoryKey !== "all" && categoryKey !== "tags"),
    });

    const sceneItems = scenesResult.data?.findScenes.scenes ?? [];
    const sceneCount = scenesResult.data?.findScenes.count ?? 0;

    const imageItems = imagesResult.data?.findImages.images ?? [];
    const imageCount = imagesResult.data?.findImages.count ?? 0;

    const groupItems = groupsResult.data?.findGroups.groups ?? [];
    const groupCount = groupsResult.data?.findGroups.count ?? 0;

    const markerItems =
      markersResult.data?.findSceneMarkers.scene_markers ?? [];
    const markerCount = markersResult.data?.findSceneMarkers.count ?? 0;

    const galleryItems = galleriesResult.data?.findGalleries.galleries ?? [];
    const galleryCount = galleriesResult.data?.findGalleries.count ?? 0;

    const performerItems =
      performersResult.data?.findPerformers.performers ?? [];
    const performerCount = performersResult.data?.findPerformers.count ?? 0;

    const studioItems = studiosResult.data?.findStudios.studios ?? [];
    const studioCount = studiosResult.data?.findStudios.count ?? 0;

    const tagItems = tagsResult.data?.findTags.tags ?? [];
    const tagCount = tagsResult.data?.findTags.count ?? 0;

    const totalMatches =
      sceneCount +
      imageCount +
      groupCount +
      markerCount +
      galleryCount +
      performerCount +
      studioCount +
      tagCount;

    const isLoading =
      (categoryKey === "all" &&
        (scenesResult.loading ||
          imagesResult.loading ||
          groupsResult.loading ||
          markersResult.loading ||
          galleriesResult.loading ||
          performersResult.loading ||
          studiosResult.loading ||
          tagsResult.loading)) ||
      (categoryKey === "scenes" && scenesResult.loading) ||
      (categoryKey === "images" && imagesResult.loading) ||
      (categoryKey === "groups" && groupsResult.loading) ||
      (categoryKey === "markers" && markersResult.loading) ||
      (categoryKey === "galleries" && galleriesResult.loading) ||
      (categoryKey === "performers" && performersResult.loading) ||
      (categoryKey === "studios" && studiosResult.loading) ||
      (categoryKey === "tags" && tagsResult.loading);

    // Global hotkey: '/' to focus the search bar
    useEffect(() => {
      const handleSlash = (e: any) => {
        if (
          document.activeElement?.tagName === "INPUT" ||
          document.activeElement?.tagName === "TEXTAREA"
        ) {
          return;
        }
        e.preventDefault();
        inputRef.current?.focus();
      };

      Mousetrap.bind("/", handleSlash);
      return () => {
        Mousetrap.unbind("/");
      };
    }, []);

    // Click outside handler
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent | TouchEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          setIsCategoryMenuOpen(false);
          setIsSuggestionsOpen(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }, []);

    const executeSearch = useCallback(
      (targetPath?: string, customTerm?: string) => {
        const query = (customTerm !== undefined ? customTerm : term).trim();
        setIsSuggestionsOpen(false);
        setIsCategoryMenuOpen(false);
        inputRef.current?.blur();

        const path = targetPath || activeCategory.path;

        if (query) {
          history.push(`${path}?q=${encodeURIComponent(query)}`);
        } else {
          history.push(path);
        }
      },
      [term, activeCategory.path, history]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const query = term.trim();
        if (!query) return;

        setIsSuggestionsOpen(false);
        setIsCategoryMenuOpen(false);
        inputRef.current?.blur();

        // 1. If explicit category is chosen in search box
        if (categoryKey !== "all") {
          const cat = CATEGORIES.find((c) => c.key === categoryKey);
          history.push(
            `${cat?.path ?? "/scenes"}?q=${encodeURIComponent(query)}`
          );
          return;
        }

        // 2. If viewing a specific tab in the dropdown
        if (activeDropdownTab !== "all") {
          const cat = CATEGORIES.find((c) => c.key === activeDropdownTab);
          history.push(
            `${cat?.path ?? "/scenes"}?q=${encodeURIComponent(query)}`
          );
          return;
        }

        // 3. Global mode: navigate to the first entity with matches, or default to scenes
        if (sceneCount > 0) {
          history.push(`/scenes?q=${encodeURIComponent(query)}`);
        } else if (performerCount > 0) {
          history.push(`/performers?q=${encodeURIComponent(query)}`);
        } else if (groupCount > 0) {
          history.push(`/groups?q=${encodeURIComponent(query)}`);
        } else if (markerCount > 0) {
          history.push(`/scenes/markers?q=${encodeURIComponent(query)}`);
        } else if (galleryCount > 0) {
          history.push(`/galleries?q=${encodeURIComponent(query)}`);
        } else if (imageCount > 0) {
          history.push(`/images?q=${encodeURIComponent(query)}`);
        } else if (studioCount > 0) {
          history.push(`/studios?q=${encodeURIComponent(query)}`);
        } else if (tagCount > 0) {
          history.push(`/tags?q=${encodeURIComponent(query)}`);
        } else {
          history.push(`/scenes?q=${encodeURIComponent(query)}`);
        }
      } else if (e.key === "Escape") {
        setIsSuggestionsOpen(false);
        setIsCategoryMenuOpen(false);
        inputRef.current?.blur();
      }
    };

    const navigateToItem = (url: string) => {
      setIsSuggestionsOpen(false);
      setIsCategoryMenuOpen(false);
      history.push(url);
    };

    return (
      <div className="front-page-search-container" ref={containerRef}>
        <div className={`front-page-search-box ${isFocused ? "focused" : ""}`}>
          {/* Category Selector Dropdown */}
          <div className="search-category-dropdown">
            <button
              type="button"
              className="category-toggle-btn"
              onClick={() => {
                setIsCategoryMenuOpen((prev) => !prev);
                setIsSuggestionsOpen(false);
              }}
              title={`搜索范围: ${activeCategory.label} (点击切换)`}
            >
              <Icon icon={activeCategory.icon} />
              <Icon
                icon={faChevronDown}
                className={`category-chevron ${
                  isCategoryMenuOpen ? "open" : ""
                }`}
              />
            </button>

            {isCategoryMenuOpen && (
              <div className="category-menu">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    className={`category-item ${
                      cat.key === categoryKey ? "active" : ""
                    }`}
                    onClick={() => {
                      setCategoryKey(cat.key);
                      setActiveDropdownTab(cat.key);
                      setIsCategoryMenuOpen(false);
                      inputRef.current?.focus();
                    }}
                  >
                    <Icon icon={cat.icon} />
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="search-divider" />

          {/* Search Input Field */}
          <input
            ref={inputRef}
            type="text"
            className="search-input-field"
            value={term}
            placeholder={activeCategory.placeholder}
            onChange={(e) => {
              setTerm(e.target.value);
              setIsSuggestionsOpen(true);
            }}
            onFocus={() => {
              setIsFocused(true);
              setIsSuggestionsOpen(true);
            }}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
          />

          {/* Clear Button */}
          {term && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setTerm("");
                setDebouncedTerm("");
                inputRef.current?.focus();
              }}
              title="清空"
            >
              <Icon icon={faTimes} />
            </button>
          )}

          {/* Search Submit Button */}
          <button
            type="button"
            className="search-submit-btn"
            onClick={() => {
              const query = term.trim();
              if (categoryKey !== "all") {
                executeSearch(activeCategory.path, query);
              } else if (activeDropdownTab !== "all") {
                const cat = CATEGORIES.find(
                  (c) => c.key === activeDropdownTab
                );
                executeSearch(cat?.path ?? "/scenes", query);
              } else {
                executeSearch("/scenes", query);
              }
            }}
            title="搜索"
          >
            <Icon icon={faSearch} />
          </button>
        </div>

        {/* Live Search Suggestions Dropdown */}
        {isSuggestionsOpen && debouncedTerm && (
          <div className="search-suggestions-dropdown">
            {/* Top Navigation Filter Tabs */}
            <div className="suggestions-tabs-bar">
              {categoryKey === "all" && (
                <button
                  type="button"
                  className={`tab-pill ${
                    activeDropdownTab === "all" ? "active" : ""
                  }`}
                  onClick={() => setActiveDropdownTab("all")}
                >
                  <Icon icon={faGlobe} />
                  <span>全部</span>
                  <span className="pill-count">{totalMatches}</span>
                </button>
              )}

              {(categoryKey === "all" || categoryKey === "scenes") &&
                (sceneCount > 0 || categoryKey === "scenes") && (
                  <button
                    type="button"
                    className={`tab-pill ${
                      activeDropdownTab === "scenes" ? "active" : ""
                    }`}
                    onClick={() => setActiveDropdownTab("scenes")}
                  >
                    <Icon icon={faPlayCircle} />
                    <span>短片</span>
                    <span className="pill-count">{sceneCount}</span>
                  </button>
                )}

              {(categoryKey === "all" || categoryKey === "performers") &&
                (performerCount > 0 || categoryKey === "performers") && (
                  <button
                    type="button"
                    className={`tab-pill ${
                      activeDropdownTab === "performers" ? "active" : ""
                    }`}
                    onClick={() => setActiveDropdownTab("performers")}
                  >
                    <Icon icon={faUser} />
                    <span>演员</span>
                    <span className="pill-count">{performerCount}</span>
                  </button>
                )}

              {(categoryKey === "all" || categoryKey === "groups") &&
                (groupCount > 0 || categoryKey === "groups") && (
                  <button
                    type="button"
                    className={`tab-pill ${
                      activeDropdownTab === "groups" ? "active" : ""
                    }`}
                    onClick={() => setActiveDropdownTab("groups")}
                  >
                    <Icon icon={faFilm} />
                    <span>集合</span>
                    <span className="pill-count">{groupCount}</span>
                  </button>
                )}

              {(categoryKey === "all" || categoryKey === "markers") &&
                (markerCount > 0 || categoryKey === "markers") && (
                  <button
                    type="button"
                    className={`tab-pill ${
                      activeDropdownTab === "markers" ? "active" : ""
                    }`}
                    onClick={() => setActiveDropdownTab("markers")}
                  >
                    <Icon icon={faMapMarkerAlt} />
                    <span>标记</span>
                    <span className="pill-count">{markerCount}</span>
                  </button>
                )}

              {(categoryKey === "all" || categoryKey === "galleries") &&
                (galleryCount > 0 || categoryKey === "galleries") && (
                  <button
                    type="button"
                    className={`tab-pill ${
                      activeDropdownTab === "galleries" ? "active" : ""
                    }`}
                    onClick={() => setActiveDropdownTab("galleries")}
                  >
                    <Icon icon={faImages} />
                    <span>图库</span>
                    <span className="pill-count">{galleryCount}</span>
                  </button>
                )}

              {(categoryKey === "all" || categoryKey === "images") &&
                (imageCount > 0 || categoryKey === "images") && (
                  <button
                    type="button"
                    className={`tab-pill ${
                      activeDropdownTab === "images" ? "active" : ""
                    }`}
                    onClick={() => setActiveDropdownTab("images")}
                  >
                    <Icon icon={faImage} />
                    <span>图片</span>
                    <span className="pill-count">{imageCount}</span>
                  </button>
                )}

              {(categoryKey === "all" || categoryKey === "studios") &&
                (studioCount > 0 || categoryKey === "studios") && (
                  <button
                    type="button"
                    className={`tab-pill ${
                      activeDropdownTab === "studios" ? "active" : ""
                    }`}
                    onClick={() => setActiveDropdownTab("studios")}
                  >
                    <Icon icon={faVideo} />
                    <span>工作室</span>
                    <span className="pill-count">{studioCount}</span>
                  </button>
                )}

              {(categoryKey === "all" || categoryKey === "tags") &&
                (tagCount > 0 || categoryKey === "tags") && (
                  <button
                    type="button"
                    className={`tab-pill ${
                      activeDropdownTab === "tags" ? "active" : ""
                    }`}
                    onClick={() => setActiveDropdownTab("tags")}
                  >
                    <Icon icon={faTag} />
                    <span>标签</span>
                    <span className="pill-count">{tagCount}</span>
                  </button>
                )}
            </div>

            {/* Content Body */}
            <div className="suggestions-scroll-body">
              {isLoading && (
                <div className="suggestions-loading">
                  <Icon icon={faSpinner} spin className="mr-2" />
                  <span>正在搜索中...</span>
                </div>
              )}

              {!isLoading && totalMatches === 0 && (
                <div className="suggestions-empty">
                  未找到与“<span className="highlight-query">{debouncedTerm}</span>”匹配的任何内容
                </div>
              )}

              {/* 1. SCENES */}
              {(activeDropdownTab === "all" || activeDropdownTab === "scenes") &&
                sceneItems.length > 0 && (
                  <div className="category-section">
                    <div className="category-section-header">
                      <div className="header-left">
                        <Icon icon={faPlayCircle} className="category-icon" />
                        <span className="category-name">短片</span>
                        <span className="category-badge">{sceneCount}</span>
                      </div>
                      <button
                        type="button"
                        className="view-all-link"
                        onClick={() => executeSearch("/scenes", debouncedTerm)}
                      >
                        查看全部短片
                      </button>
                    </div>
                    <div className="category-grid">
                      {sceneItems.map((s) => {
                        const title = objectTitle(s);
                        const performerNames = s.performers
                          .map((p) => p.name)
                          .join(", ");
                        const duration = s.files[0]?.duration
                          ? TextUtils.secondsToTimestamp(s.files[0].duration)
                          : undefined;

                        return (
                          <div
                            key={s.id}
                            className="result-card scene-card"
                            onClick={() => navigateToItem(`/scenes/${s.id}`)}
                          >
                            <div className="card-thumb-wrap">
                              <img
                                src={s.paths.screenshot ?? ""}
                                alt={title}
                                className="card-thumb"
                              />
                              {duration && (
                                <span className="time-badge">{duration}</span>
                              )}
                            </div>
                            <div className="card-content">
                              <div className="card-title" title={title}>
                                {title}
                              </div>
                              <div className="card-meta">
                                {performerNames || s.studio?.name || s.date || "视频"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* 2. PERFORMERS */}
              {(activeDropdownTab === "all" ||
                activeDropdownTab === "performers") &&
                performerItems.length > 0 && (
                  <div className="category-section">
                    <div className="category-section-header">
                      <div className="header-left">
                        <Icon icon={faUser} className="category-icon" />
                        <span className="category-name">演员</span>
                        <span className="category-badge">{performerCount}</span>
                      </div>
                      <button
                        type="button"
                        className="view-all-link"
                        onClick={() =>
                          executeSearch("/performers", debouncedTerm)
                        }
                      >
                        查看全部演员
                      </button>
                    </div>
                    <div className="performers-flex-list">
                      {performerItems.map((p) => (
                        <div
                          key={p.id}
                          className="performer-pill-card"
                          onClick={() =>
                            navigateToItem(`/performers/${p.id}`)
                          }
                        >
                          {p.image_path ? (
                            <img
                              src={p.image_path}
                              alt={p.name}
                              className="performer-avatar"
                            />
                          ) : (
                            <div className="performer-avatar-placeholder">
                              <Icon icon={faUser} />
                            </div>
                          )}
                          <div className="performer-info">
                            <span className="performer-name">{p.name}</span>
                            {p.disambiguation && (
                              <span className="performer-sub">
                                ({p.disambiguation})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* 3. GROUPS */}
              {(activeDropdownTab === "all" || activeDropdownTab === "groups") &&
                groupItems.length > 0 && (
                  <div className="category-section">
                    <div className="category-section-header">
                      <div className="header-left">
                        <Icon icon={faFilm} className="category-icon" />
                        <span className="category-name">集合</span>
                        <span className="category-badge">{groupCount}</span>
                      </div>
                      <button
                        type="button"
                        className="view-all-link"
                        onClick={() => executeSearch("/groups", debouncedTerm)}
                      >
                        查看全部集合
                      </button>
                    </div>
                    <div className="category-grid">
                      {groupItems.map((g) => (
                        <div
                          key={g.id}
                          className="result-card group-card"
                          onClick={() => navigateToItem(`/groups/${g.id}`)}
                        >
                          <div className="card-thumb-wrap poster-wrap">
                            {g.front_image_path ? (
                              <img
                                src={g.front_image_path}
                                alt={g.name}
                                className="card-thumb poster-thumb"
                              />
                            ) : (
                              <div className="poster-placeholder">
                                <Icon icon={faFilm} />
                              </div>
                            )}
                          </div>
                          <div className="card-content">
                            <div className="card-title" title={g.name}>
                              {g.name}
                            </div>
                            <div className="card-meta">
                              {g.scene_count
                                ? `${g.scene_count} 个短片`
                                : g.date || "合集"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* 4. SCENE MARKERS */}
              {(activeDropdownTab === "all" ||
                activeDropdownTab === "markers") &&
                markerItems.length > 0 && (
                  <div className="category-section">
                    <div className="category-section-header">
                      <div className="header-left">
                        <Icon
                          icon={faMapMarkerAlt}
                          className="category-icon"
                        />
                        <span className="category-name">标记</span>
                        <span className="category-badge">{markerCount}</span>
                      </div>
                      <button
                        type="button"
                        className="view-all-link"
                        onClick={() =>
                          executeSearch("/scenes/markers", debouncedTerm)
                        }
                      >
                        查看全部标记
                      </button>
                    </div>
                    <div className="category-grid">
                      {markerItems.map((m) => {
                        const markerUrl = NavUtils.makeSceneMarkerUrl(m);
                        const thumb = m.screenshot || m.preview;
                        const time = TextUtils.secondsToTimestamp(m.seconds);

                        return (
                          <div
                            key={m.id}
                            className="result-card marker-card"
                            onClick={() => navigateToItem(markerUrl)}
                          >
                            <div className="card-thumb-wrap">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={m.title}
                                  className="card-thumb"
                                />
                              ) : (
                                <div className="poster-placeholder">
                                  <Icon icon={faMapMarkerAlt} />
                                </div>
                              )}
                              <span className="time-badge">{time}</span>
                            </div>
                            <div className="card-content">
                              <div className="card-title" title={m.title}>
                                {m.title}
                              </div>
                              <div className="card-meta">
                                {m.scene?.title || m.primary_tag?.name || "场景片段"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* 5. GALLERIES */}
              {(activeDropdownTab === "all" ||
                activeDropdownTab === "galleries") &&
                galleryItems.length > 0 && (
                  <div className="category-section">
                    <div className="category-section-header">
                      <div className="header-left">
                        <Icon icon={faImages} className="category-icon" />
                        <span className="category-name">图库</span>
                        <span className="category-badge">{galleryCount}</span>
                      </div>
                      <button
                        type="button"
                        className="view-all-link"
                        onClick={() =>
                          executeSearch("/galleries", debouncedTerm)
                        }
                      >
                        查看全部图库
                      </button>
                    </div>
                    <div className="category-grid">
                      {galleryItems.map((gal) => (
                        <div
                          key={gal.id}
                          className="result-card gallery-card"
                          onClick={() =>
                            navigateToItem(`/galleries/${gal.id}`)
                          }
                        >
                          <div className="card-thumb-wrap">
                            {gal.paths.cover ? (
                              <img
                                src={gal.paths.cover}
                                alt={gal.title ?? ""}
                                className="card-thumb"
                              />
                            ) : (
                              <div className="poster-placeholder">
                                <Icon icon={faImages} />
                              </div>
                            )}
                            {gal.image_count !== undefined && (
                              <span className="count-badge">
                                {gal.image_count} 张
                              </span>
                            )}
                          </div>
                          <div className="card-content">
                            <div
                              className="card-title"
                              title={gal.title ?? "未命名相册"}
                            >
                              {gal.title ?? "未命名相册"}
                            </div>
                            <div className="card-meta">
                              {gal.studio?.name || gal.date || "图库"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* 6. IMAGES */}
              {(activeDropdownTab === "all" || activeDropdownTab === "images") &&
                imageItems.length > 0 && (
                  <div className="category-section">
                    <div className="category-section-header">
                      <div className="header-left">
                        <Icon icon={faImage} className="category-icon" />
                        <span className="category-name">图片</span>
                        <span className="category-badge">{imageCount}</span>
                      </div>
                      <button
                        type="button"
                        className="view-all-link"
                        onClick={() => executeSearch("/images", debouncedTerm)}
                      >
                        查看全部图片
                      </button>
                    </div>
                    <div className="category-grid image-grid">
                      {imageItems.map((img) => {
                        const title = img.title || "图片";
                        const thumb =
                          img.paths.thumbnail || img.paths.image;

                        return (
                          <div
                            key={img.id}
                            className="result-card image-card"
                            onClick={() => navigateToItem(`/images/${img.id}`)}
                          >
                            <div className="card-thumb-wrap image-wrap">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={title}
                                  className="card-thumb"
                                />
                              ) : (
                                <div className="poster-placeholder">
                                  <Icon icon={faImage} />
                                </div>
                              )}
                            </div>
                            <div className="card-content">
                              <div className="card-title" title={title}>
                                {title}
                              </div>
                              <div className="card-meta">
                                {img.date || "图片"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* 7. STUDIOS */}
              {(activeDropdownTab === "all" ||
                activeDropdownTab === "studios") &&
                studioItems.length > 0 && (
                  <div className="category-section">
                    <div className="category-section-header">
                      <div className="header-left">
                        <Icon icon={faVideo} className="category-icon" />
                        <span className="category-name">工作室</span>
                        <span className="category-badge">{studioCount}</span>
                      </div>
                      <button
                        type="button"
                        className="view-all-link"
                        onClick={() =>
                          executeSearch("/studios", debouncedTerm)
                        }
                      >
                        查看全部工作室
                      </button>
                    </div>
                    <div className="studios-flex-list">
                      {studioItems.map((st) => (
                        <div
                          key={st.id}
                          className="studio-pill-card"
                          onClick={() => navigateToItem(`/studios/${st.id}`)}
                        >
                          {st.image_path ? (
                            <img
                              src={st.image_path}
                              alt={st.name}
                              className="studio-logo"
                            />
                          ) : (
                            <div className="studio-logo-placeholder">
                              <Icon icon={faVideo} />
                            </div>
                          )}
                          <div className="studio-info">
                            <span className="studio-name">{st.name}</span>
                            {st.parent_studio && (
                              <span className="studio-sub">
                                隶属: {st.parent_studio.name}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* 8. TAGS */}
              {(activeDropdownTab === "all" || activeDropdownTab === "tags") &&
                tagItems.length > 0 && (
                  <div className="category-section">
                    <div className="category-section-header">
                      <div className="header-left">
                        <Icon icon={faTag} className="category-icon" />
                        <span className="category-name">标签</span>
                        <span className="category-badge">{tagCount}</span>
                      </div>
                      <button
                        type="button"
                        className="view-all-link"
                        onClick={() => executeSearch("/tags", debouncedTerm)}
                      >
                        查看全部标签
                      </button>
                    </div>
                    <div className="tags-flex-list">
                      {tagItems.map((t) => (
                        <div
                          key={t.id}
                          className="tag-chip-card"
                          onClick={() => navigateToItem(`/tags/${t.id}`)}
                        >
                          <Icon icon={faTag} className="tag-icon" />
                          <span className="tag-name">{t.name}</span>
                          {t.scene_count !== undefined && t.scene_count > 0 && (
                            <span className="tag-count-badge">
                              {t.scene_count}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Bottom Actions Footer */}
            <div className="suggestions-footer">
              <span className="footer-hint">
                找到共 <strong>{totalMatches}</strong> 项结果 · 按 <kbd>Enter</kbd> 搜索 · 按 <kbd>Esc</kbd> 退出
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default FrontPageSearchBar;
