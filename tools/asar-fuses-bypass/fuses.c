//
// Created by kitbyte on 30.11.2025.
//

#include <Windows.h>
#include <stdio.h>
#include <time.h>

#define ENABLE_LOGGING 0

#ifndef _DEBUG
#undef ENABLE_LOGGING
#define ENABLE_LOGGING 0
#endif

#define FUSE_SENTINEL_LENGTH    32
#define FUSE_VERSION_SUPPORTED  1
#define FUSE_MIN_WIRE_LENGTH    5

#define ALIGN8(ptr, mod) ((((ULONG_PTR)(ptr) + 7) & ~7) + ((mod) * 8))

#if defined(_WIN64)
    #define SENTINEL_PART1 0x6E64474B70374C64ULL
    #define SENTINEL_PART2 0x6262503639377A4EULL
    #define SENTINEL_PART3 0x58486D4B4E57516AULL
    #define SENTINEL_PART4 0x5873743942615A42ULL
#else
    static const DWORD SENTINEL_PARTS[8] = {
        0x70374C64, 0x6E64474B,
        0x39377A4E, 0x62625036,
        0x4E57516A, 0x58486D4B,
        0x42615A42, 0x58737439
    };
#endif

typedef enum {
    FUSE_RUN_AS_NODE = 0,
    FUSE_COOKIE_ENCRYPTION = 1,
    FUSE_NODE_OPTIONS = 2,
    FUSE_NODE_CLI_INSPECT = 3,
    FUSE_ASAR_INTEGRITY_VALIDATION = 4,
    FUSE_ONLY_LOAD_APP_FROM_ASAR = 5,
    FUSE_LOAD_BROWSER_V8_SNAPSHOT = 6,
    FUSE_GRANT_FILE_PROTOCOL = 7
} ElectronFuseIndex;

typedef enum {
    FUSE_STATE_DISABLED = '0',
    FUSE_STATE_ENABLED = '1',
    FUSE_STATE_REMOVED = 'r'
} FuseState;

typedef struct {
    char sentinel[FUSE_SENTINEL_LENGTH];
    unsigned char version;
    unsigned char wire_length;
    unsigned char fuses[];
} FuseWire;

#if ENABLE_LOGGING

static FILE* g_logFile = NULL;

static void log_init(void) {
    char path[MAX_PATH];
    GetModuleFileNameA(NULL, path, MAX_PATH);
    char* dot = strrchr(path, '.');
    if (dot) strcpy(dot, ".log");
    else strcat(path, ". log");

    g_logFile = fopen(path, "a");
    if (g_logFile) {
        time_t now = time(NULL);
        fprintf(g_logFile, "\n=== Session: %s", ctime(&now));
        fflush(g_logFile);
    }
}

static void log_close(void) {
    if (g_logFile) {
        fclose(g_logFile);
        g_logFile = NULL;
    }
}

static void log_msg(const char* fmt, .. .) {
    if (!g_logFile) return;
    va_list args;
    va_start(args, fmt);
    vfprintf(g_logFile, fmt, args);
    va_end(args);
    fflush(g_logFile);
}

#else
    #define log_init()       ((void)0)
    #define log_close()      ((void)0)
    #define log_msg(...)     ((void)0)
#endif

static FuseWire* find_fuse_wire(int offset) {
    char* base = (char*)GetModuleHandleA(NULL);
    if (!base) return NULL;

    IMAGE_DOS_HEADER* dos = (IMAGE_DOS_HEADER*)base;
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) return NULL;

    IMAGE_NT_HEADERS* nt = (IMAGE_NT_HEADERS*)(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) return NULL;

    DWORD size = nt->OptionalHeader.SizeOfImage;
    char* start = (char*)ALIGN8(base, 1) + offset;
    char* end = (char*)ALIGN8(base + size - FUSE_SENTINEL_LENGTH, -1) - offset;

#if defined(_WIN64)
    for (DWORD64* p = (DWORD64*)start; p < (DWORD64*)end; p++) {
        if (p[0] == SENTINEL_PART1 && p[1] == SENTINEL_PART2 &&
            p[2] == SENTINEL_PART3 && p[3] == SENTINEL_PART4) {
            log_msg("[+] Sentinel at: %p\n", p);
            return (FuseWire*)p;
        }
    }
#else
    for (DWORD* p = (DWORD*)start; p < (DWORD*)end; p += 2) {
        if (p[0] == SENTINEL_PARTS[0] && p[1] == SENTINEL_PARTS[1] &&
            p[2] == SENTINEL_PARTS[2] && p[3] == SENTINEL_PARTS[3] &&
            p[4] == SENTINEL_PARTS[4] && p[5] == SENTINEL_PARTS[5] &&
            p[6] == SENTINEL_PARTS[6] && p[7] == SENTINEL_PARTS[7]) {
            log_msg("[+] Sentinel at: %p\n", p);
            return (FuseWire*)p;
        }
    }
#endif
    return NULL;
}

static BOOL patch_fuse(unsigned char* fuse) {
    DWORD prot;
    if (!VirtualProtect(fuse, 1, PAGE_READWRITE, &prot)) {
        log_msg("[-] VirtualProtect failed: %lu\n", GetLastError());
        return FALSE;
    }
    *fuse = FUSE_STATE_REMOVED;
    VirtualProtect(fuse, 1, prot, &prot);
    return TRUE;
}

BOOL disable_asar_integrity(void) {
    log_init();

    FuseWire* wire = find_fuse_wire(0);
    if (! wire) wire = find_fuse_wire(4);

    if (! wire) {
        log_msg("[-] Fuse wire not found\n");
        log_close();
        return FALSE;
    }

    log_msg("[+] Wire at %p, ver=%d, len=%d\n", wire, wire->version, wire->wire_length);

    if (wire->version != FUSE_VERSION_SUPPORTED) {
        log_msg("[-] Unsupported version: %d\n", wire->version);
        log_close();
        return FALSE;
    }

    if (wire->wire_length < FUSE_MIN_WIRE_LENGTH) {
        log_msg("[*] Wire too short, skip\n");
        log_close();
        return TRUE;
    }

    unsigned char* target = &wire->fuses[FUSE_ASAR_INTEGRITY_VALIDATION];

    if (*target == FUSE_STATE_REMOVED) {
        log_msg("[*] Already patched\n");
        log_close();
        return TRUE;
    }

    log_msg("[*] Patching fuse[%d]: 0x%02X -> 0x%02X\n",
            FUSE_ASAR_INTEGRITY_VALIDATION, *target, FUSE_STATE_REMOVED);

    BOOL result = patch_fuse(target);
    log_msg(result ? "[+] Success\n" : "[-] Failed\n");

    log_close();
    return result;
}