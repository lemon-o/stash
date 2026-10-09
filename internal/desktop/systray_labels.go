//go:build windows || darwin

package desktop

import (
	"strings"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

// The backend has no i18n framework of its own, so the tray/desktop labels live
// here. They follow the configured interface language (config.Language, which
// defaults to zh-CN in this build) and mirror the wording used by the web UI
// (ui/v2.5/src/locales/<lang>.json) so that the tray matches the sidebar.
//
// This file is deliberately not gated on cgo: desktop_platform_windows.go does
// not require cgo, so the labels must be available for CGO_ENABLED=0 builds too.
type systrayLabels struct {
	tooltip         string // %d = port
	open            string
	openTooltip     string
	openEntity      string // %s = entity label
	quit            string
	quitTooltip     string
	movedTitle      string
	movedText       string // %s = location
	locationTray    string
	locationMenuBar string
	entities        map[string]string // nil = fall back to title-casing the identifier
}

var systrayLabelsZhCN = systrayLabels{
	tooltip:         "Stash 正在运行（端口 %d）",
	open:            "打开 Stash",
	openTooltip:     "在浏览器中打开 Stash",
	openEntity:      "打开%s",
	quit:            "退出 Stash",
	quitTooltip:     "退出 Stash 服务器",
	movedTitle:      "Stash 已移至系统托盘",
	movedText:       "Stash 现在运行在%s中，不再占用终端窗口。",
	locationTray:    "系统托盘",
	locationMenuBar: "菜单栏",
	entities: map[string]string{
		"scenes":     "短片",
		"images":     "图片",
		"groups":     "集合",
		"markers":    "标记",
		"galleries":  "图库",
		"performers": "演员",
		"studios":    "工作室",
		"tags":       "标签",
	},
}

var systrayLabelsEn = systrayLabels{
	tooltip:         "Stash is Running on port %d.",
	open:            "Open Stash",
	openTooltip:     "Open a browser window to Stash",
	openEntity:      "Open to %s",
	quit:            "Quit Stash Server",
	quitTooltip:     "Quits the Stash server",
	movedTitle:      "Stash has moved!",
	movedText:       "Stash now runs in your %s, instead of a terminal window.",
	locationTray:    "tray",
	locationMenuBar: "menu bar",
}

func systrayLabelsFor(lang string) systrayLabels {
	if strings.HasPrefix(strings.ToLower(lang), "zh") {
		return systrayLabelsZhCN
	}
	return systrayLabelsEn
}

// entity returns the display label for a menu item. Unknown (user-supplied)
// entries keep the previous title-cased identifier behaviour.
func (l systrayLabels) entity(item string) string {
	if label, ok := l.entities[item]; ok && label != "" {
		return label
	}
	return cases.Title(language.Und).String(strings.ToLower(item))
}
