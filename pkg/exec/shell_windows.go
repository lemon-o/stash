//go:build windows
// +build windows

package exec

import (
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

// hideExecShell prevents the child process from allocating a visible console window.
//
// Stash ships as a GUI-subsystem binary (see desktop/Stash.iss and 打包stash.py, which
// rewrite the PE Subsystem field from 3/CONSOLE to 2/GUI at packaging time), so the
// process runs with no attached console. Every console child process it spawns
// (ffmpeg, ffprobe, vips, python, plugin scripts) would then make Windows allocate a
// brand new console window. On startup the hardware codec probe alone launches ffmpeg
// once per candidate encoder, which is what produced the burst of flashing console
// windows.
//
// CREATE_NO_WINDOW runs the child as a console application without allocating a console
// window. Output redirection is unaffected, because Go sets the STARTUPINFO std handles
// explicitly whenever cmd.Stdout/Stderr/Stdin are assigned.
//
// NOTE: the previous implementation was
//
//	CreationFlags: windows.DETACHED_PROCESS & windows.CREATE_NO_WINDOW
//
// which is a bitwise AND of 0x00000008 and 0x08000000, i.e. exactly 0 — no flags at all.
// The bug was invisible while Stash was a console-subsystem binary (children simply
// inherited the parent's console) and became visible the moment it was switched to GUI.
func hideExecShell(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: windows.CREATE_NO_WINDOW,
		HideWindow:    true,
	}
}
