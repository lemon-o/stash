import sys

def __prefix(levelChar):
    startLevelChar = b'\x01'
    endLevelChar = b'\x02'
    ret = startLevelChar + levelChar + endLevelChar
    return ret.decode()

def __log(levelChar, s):
    if levelChar == "":
        return
    try:
        print(__prefix(levelChar) + str(s) + "\n", file=sys.stderr, flush=True)
    except Exception:
        pass

def LogTrace(s):
    __log(b't', s)

def LogDebug(s):
    __log(b'd', s)

def LogInfo(s):
    __log(b'i', s)

def LogWarning(s):
    __log(b'w', s)

def LogError(s):
    __log(b'e', s)

def LogProgress(p):
    progress = min(max(0, p), 1)
    __log(b'p', str(progress))
