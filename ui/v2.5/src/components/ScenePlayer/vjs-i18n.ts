import videojs, { VideoJsPlayer } from "video.js";

export const zhCN: Record<string, string> = {
  // 基础播放控制
  Play: "播放",
  Pause: "暂停",
  Replay: "重新播放",
  "Current Time": "当前时间",
  Duration: "时长",
  "Remaining Time": "剩余时间",
  "Stream Type": "媒体流类型",
  LIVE: "直播",
  Loaded: "加载完成",
  Progress: "进度",
  "Progress Bar": "进度条",
  Fullscreen: "全屏",
  "Non-Fullscreen": "退出全屏",
  "Exit Fullscreen": "退出全屏",
  "Picture-in-Picture": "画中画",
  "Exit Picture-in-Picture": "退出画中画",
  Mute: "静音",
  Unmute: "取消静音",
  "Volume Level": "音量",

  // 播放速度与倍速
  "Playback Rate": "倍速",

  // 上下部切换 (Playlist / Skip Buttons)
  "Skip to next video": "下一个视频",
  "Skip to previous video": "上一个视频",
  "Next video": "下一个视频",
  "Previous video": "上一个视频",

  // 快进快退 (videojs-seek-buttons)
  "Seek forward {{seconds}} seconds": "快进 {{seconds}} 秒",
  "Seek back {{seconds}} seconds": "快退 {{seconds}} 秒",

  // 自动连播开关 (autostart)
  "Auto-start enabled (click to disable)": "自动连播已开启 (点击关闭)",
  "Auto-start disabled (click to enable)": "自动连播已关闭 (点击开启)",

  // 画质 / 源选择
  Quality: "画质",
  "Quality selector": "清晰度",
  "Source Menu": "画质选择",
  Settings: "设置",
  Auto: "自动",
  "自动": "自动",
  "原画": "原画",
  "Direct Stream": "原画",
  "direct stream": "原画",

  // 投屏与串流 (Chromecast & AirPlay)
  "Start AirPlay": "隔空播放 (AirPlay)",
  AirPlay: "隔空播放",
  "Open Chromecast menu": "投屏 (Chromecast)",
  Cast: "投屏",
  "Disconnect Cast": "断开投屏",

  // 音频描述 (Descriptions - AD 按钮)
  Descriptions: "音频描述",
  "descriptions off": "关闭音频描述",
  "descriptions settings": "音频描述设置",
  ", opens descriptions settings dialog": ", 打开音频描述设置窗口",

  // 字幕与内嵌字幕
  Subtitles: "字幕",
  "subtitles off": "关闭字幕",
  "subtitles settings": "字幕设置",
  ", opens subtitles settings dialog": ", 打开字幕设置窗口",
  Captions: "内嵌字幕",
  "captions off": "关闭内嵌字幕",
  "captions settings": "内嵌字幕设置",
  ", opens captions settings dialog": ", 打开内嵌字幕设置窗口",
  "captions and subtitles off": "关闭字幕",
  "subtitles and captions off": "关闭字幕",
  "Captions and subtitles off": "关闭字幕",
  "Subtitles and captions off": "关闭字幕",
  "captions and subtitles": "字幕",
  "subtitles and captions": "字幕",
  "Captions and Subtitles": "字幕",
  "Subtitles and Captions": "字幕",
  "Captions/Subtitles": "字幕",
  "captions/subtitles": "字幕",
  "captions and subtitles settings": "字幕设置",
  "subtitles and captions settings": "字幕设置",
  ", opens captions and subtitles settings dialog": ", 打开字幕设置窗口",
  ", opens subtitles and captions settings dialog": ", 打开字幕设置窗口",

  // 音轨
  "Audio Track": "音轨",
  main: "主音轨",
  Unknown: "未知音轨",
  und: "未指定",

  // 章节
  Chapters: "章节",
  "Chapters Menu": "章节菜单",

  // VR 模式
  "VR Mode": "VR 模式",
  Off: "关闭",

  // 弹窗与设置
  "Close Modal Dialog": "关闭弹窗",
  Close: "关闭",
  "Modal Window": "弹窗",
  "This is a modal window": "这是一个弹窗",
  "This modal can be closed by pressing the Escape key or activating the close button.":
    "可以按 ESC 键或点击关闭按钮来关闭此弹窗。",
  ", selected": ", 已选择",
  "Audio Player": "音频播放器",
  "Video Player": "视频播放器",
  Text: "文字",
  White: "白",
  Black: "黑",
  Red: "红",
  Green: "绿",
  Blue: "蓝",
  Yellow: "黄",
  Magenta: "洋红",
  Cyan: "青",
  Background: "背景",
  Window: "窗口",
  Transparent: "透明",
  "Semi-Transparent": "半透明",
  Opaque: "不透明",
  "Font Size": "字体尺寸",
  "Text Edge Style": "字体边框样式",
  None: "无",
  Raised: "凸起",
  Depressed: "凹陷",
  Uniform: "均匀",
  Dropshadow: "阴影",
  "Font Family": "字体系列",
  "Proportional Sans-Serif": "无衬线字体",
  "Monospace Sans-Serif": "等宽无衬线字体",
  "Proportional Serif": "衬线字体",
  "Monospace Serif": "等宽衬线字体",
  Casual: "手写体",
  Script: "书法体",
  "Small Caps": "小型大写字体",
  Reset: "重置",
  "restore all settings to the default values": "恢复所有设置至默认值",
  Done: "完成",
  "Caption Settings Dialog": "字幕设置窗口",
  "Beginning of dialog window. Escape will cancel and close the window.":
    "打开对话窗口。按 ESC 键将取消并关闭对话窗口。",
  "End of dialog window.": "结束对话窗口。",
  "Seek to live, currently behind live": "转至直播，当前落后于直播进度",
  "Seek to live, currently playing live": "转至直播，当前处于实时直播",
  "progress bar timing: currentTime={1} duration={2}": "{1}/{2}",
  "{1} is loading.": "正在加载 {1}。",
  "No content": "无内容",
};

export const zhTW: Record<string, string> = {
  // 基礎播放控制
  Play: "播放",
  Pause: "暫停",
  Replay: "重播",
  "Current Time": "目前時間",
  Duration: "總共時間",
  "Remaining Time": "剩餘時間",
  "Stream Type": "串流類型",
  LIVE: "直播",
  Loaded: "載入完畢",
  Progress: "進度",
  "Progress Bar": "進度列",
  Fullscreen: "全螢幕",
  "Non-Fullscreen": "退出全螢幕",
  "Exit Fullscreen": "退出全螢幕",
  "Picture-in-Picture": "子母畫面",
  "Exit Picture-in-Picture": "退出子母畫面",
  Mute: "靜音",
  Unmute: "取消靜音",
  "Volume Level": "音量",

  // 播放速度與倍速
  "Playback Rate": "倍速",

  // 上下部切換
  "Skip to next video": "下一個影片",
  "Skip to previous video": "上一個影片",
  "Next video": "下一個影片",
  "Previous video": "上一個影片",

  // 快進快退
  "Seek forward {{seconds}} seconds": "快進 {{seconds}} 秒",
  "Seek back {{seconds}} seconds": "快退 {{seconds}} 秒",

  // 自動連播開關
  "Auto-start enabled (click to disable)": "自動連播已開啟 (點擊關閉)",
  "Auto-start disabled (click to enable)": "自動連播已關閉 (點擊開啟)",

  // 畫質 / 源選擇
  Quality: "畫質",
  "Quality selector": "解析度",
  "Source Menu": "畫質選擇",
  Settings: "設定",
  Auto: "自動",
  "自动": "自動",
  "自動": "自動",
  "原画": "原畫",
  "原畫": "原畫",
  "Direct Stream": "原畫",
  "direct stream": "原畫",

  // 投屏與串流
  "Start AirPlay": "隔空播放 (AirPlay)",
  AirPlay: "隔空播放",
  "Open Chromecast menu": "投放 (Chromecast)",
  Cast: "投放",
  "Disconnect Cast": "中斷投放",

  // 音訊描述
  Descriptions: "音訊描述",
  "descriptions off": "關閉音訊描述",
  "descriptions settings": "音訊描述設定",
  ", opens descriptions settings dialog": ", 開啟音訊描述設定視窗",

  // 字幕與內嵌字幕
  Subtitles: "字幕",
  "subtitles off": "關閉字幕",
  "subtitles settings": "字幕設定",
  ", opens subtitles settings dialog": ", 開啟字幕設定視窗",
  Captions: "內嵌字幕",
  "captions off": "關閉內嵌字幕",
  "captions settings": "內嵌字幕設定",
  ", opens captions settings dialog": ", 開啟內嵌字幕設定視窗",
  "captions and subtitles off": "關閉字幕",
  "subtitles and captions off": "關閉字幕",
  "Captions and subtitles off": "關閉字幕",
  "Subtitles and captions off": "關閉字幕",
  "captions and subtitles": "字幕",
  "subtitles and captions": "字幕",
  "Captions and Subtitles": "字幕",
  "Subtitles and Captions": "字幕",
  "Captions/Subtitles": "字幕",
  "captions/subtitles": "字幕",
  "captions and subtitles settings": "字幕設定",
  "subtitles and captions settings": "字幕設定",
  ", opens captions and subtitles settings dialog": ", 開啟字幕設定視窗",
  ", opens subtitles and captions settings dialog": ", 開啟字幕設定視窗",

  // 音軌
  "Audio Track": "音軌",
  main: "主要音軌",
  Unknown: "未知音軌",
  und: "未指定",

  // 章節
  Chapters: "章節",
  "Chapters Menu": "章節選單",

  // VR 模式
  "VR Mode": "VR 模式",
  Off: "關閉",

  // 對話框與設定
  "Close Modal Dialog": "關閉對話框",
  Close: "關閉",
  "Modal Window": "彈出視窗",
  "This is a modal window": "此為彈出視窗",
  "This modal can be closed by pressing the Escape key or activating the close button.":
    "可以按 ESC 按鍵或點擊關閉按鈕來關閉此視窗。",
  ", selected": ", 已選擇",
  "Audio Player": "音訊播放器",
  "Video Player": "視訊播放器",
  Text: "文字",
  White: "白",
  Black: "黑",
  Red: "紅",
  Green: "綠",
  Blue: "藍",
  Yellow: "黃",
  Magenta: "洋紅",
  Cyan: "青",
  Background: "背景",
  Window: "視窗",
  Transparent: "透明",
  "Semi-Transparent": "半透明",
  Opaque: "不透明",
  "Font Size": "字型尺寸",
  "Text Edge Style": "字型邊緣樣式",
  None: "無",
  Raised: "浮雕",
  Depressed: "壓低",
  Uniform: "均勻",
  Dropshadow: "下陰影",
  "Font Family": "字型系列",
  "Proportional Sans-Serif": "無襯線字型",
  "Monospace Sans-Serif": "等寬無襯線字型",
  "Proportional Serif": "襯線字型",
  "Monospace Serif": "等寬襯線字型",
  Casual: "手寫體",
  Script: "書法體",
  "Small Caps": "小型大寫字體",
  Reset: "重置",
  "restore all settings to the default values": "恢復全部設定至預設值",
  Done: "完成",
  "Caption Settings Dialog": "字幕設定對話框",
  "Beginning of dialog window. Escape will cancel and close the window.":
    "開啟對話視窗。按 ESC 鍵將取消並關閉視窗。",
  "End of dialog window.": "結束對話視窗。",
  "Seek to live, currently behind live": "快轉至直播，目前為稍早畫面",
  "Seek to live, currently playing live": "快轉至直播，目前為現場畫面",
  "progress bar timing: currentTime={1} duration={2}": "{1}/{2}",
  "{1} is loading.": "正在載入 {1}。",
  "No content": "無內容",
};

export const en: Record<string, string> = {
  Quality: "Quality",
  "Quality selector": "Quality",
  "Skip to next video": "Next Video",
  "Skip to previous video": "Previous Video",
  "Auto-start enabled (click to disable)":
    "Auto-start enabled (click to disable)",
  "Auto-start disabled (click to enable)":
    "Auto-start disabled (click to enable)",
};

let initialized = false;

export function initVideoJsI18n() {
  if (initialized) return;
  initialized = true;

  videojs.addLanguage("zh-CN", zhCN);
  videojs.addLanguage("zh-Hans", zhCN);
  videojs.addLanguage("zh", zhCN);
  videojs.addLanguage("zh-TW", zhTW);
  videojs.addLanguage("zh-Hant", zhTW);
  videojs.addLanguage("en", en);
  videojs.addLanguage("en-GB", en);
}

// Auto-initialize upon module import
initVideoJsI18n();

/**
 * Synchronize and ensure all control bar buttons have localized hover title attributes
 */
export function syncControlBarTitles(player: VideoJsPlayer) {
  if (!player || !player.controlBar) return;

  const cb = player.controlBar;

  // 1. Play / Pause
  const playBtn = cb.getChild("playToggle") as any;
  if (playBtn) {
    const text = player.paused()
      ? player.localize("Play")
      : player.localize("Pause");
    playBtn.controlText(text);
    playBtn.el()?.setAttribute("title", text);
  }

  // 2. Mute / Unmute
  const volumePanel = cb.getChild("volumePanel") as any;
  const muteBtn = volumePanel?.getChild("muteToggle") || cb.getChild("muteToggle") as any;
  if (muteBtn) {
    const text = player.muted()
      ? player.localize("Unmute")
      : player.localize("Mute");
    muteBtn.controlText(text);
    muteBtn.el()?.setAttribute("title", text);
  }

  // 3. Skip Previous / Next
  const prevBtn = cb.getChild("skipButtons")?.getChild("previousItem") || cb.getChild("previousItem") as any;
  if (prevBtn) {
    const text = player.localize("Previous video");
    prevBtn.controlText(text);
    prevBtn.el()?.setAttribute("title", text);
  }
  const nextBtn = cb.getChild("skipButtons")?.getChild("nextItem") || cb.getChild("nextItem") as any;
  if (nextBtn) {
    const text = player.localize("Next video");
    nextBtn.controlText(text);
    nextBtn.el()?.setAttribute("title", text);
  }

  // 4. Subtitles (SubsCaps)
  const subsCapsBtn = cb.getChild("subsCapsButton") as any;
  if (subsCapsBtn) {
    const text = player.localize("Subtitles") || "字幕";
    subsCapsBtn.controlText(text);
    subsCapsBtn.el()?.setAttribute("title", text);
  }

  // 5. Settings Button
  const sourceSelectorBtn =
    (cb.getChild("YouTubeSettingsButton") as any) ||
    (cb.getChild("SourceMenuButton") as any);
  if (sourceSelectorBtn) {
    const text = player.localize("Settings") || "设置";
    if (typeof sourceSelectorBtn.controlText === "function") {
      sourceSelectorBtn.controlText(text);
    }
    sourceSelectorBtn.el()?.setAttribute("title", text);
  }

  // 6. Fullscreen
  const fsBtn = cb.getChild("fullscreenToggle") as any;
  if (fsBtn) {
    const text = player.isFullscreen()
      ? player.localize("Exit Fullscreen")
      : player.localize("Fullscreen");
    fsBtn.controlText(text);
    fsBtn.el()?.setAttribute("title", text);
  }

  // 7. AirPlay
  const airplayBtn = cb.getChild("airPlayButton") as any;
  if (airplayBtn) {
    const text = player.localize("Start AirPlay");
    airplayBtn.controlText(text);
    airplayBtn.el()?.setAttribute("title", text);
  }

  // 8. Chromecast
  const chromecastBtn = cb.getChild("chromecastButton") as any;
  if (chromecastBtn) {
    const text = player.localize("Open Chromecast menu");
    chromecastBtn.controlText(text);
    chromecastBtn.el()?.setAttribute("title", text);
  }

  // 9. VR Mode
  const vrBtn = cb.getChild("VRMenuButton") as any;
  if (vrBtn) {
    const text = player.localize("VR Mode") || "VR 模式";
    vrBtn.controlText(text);
    vrBtn.el()?.setAttribute("title", text);
    vrBtn.menuButton_?.el()?.setAttribute("title", text);
  }
}
