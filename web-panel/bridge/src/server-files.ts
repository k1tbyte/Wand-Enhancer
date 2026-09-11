const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { REMOTE_BASE_PATH } = require('./constants');

const IPV4_OCTET_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const PHYSICAL_INTERFACE_NAME_PATTERN = /(?:ethernet|wi-?fi|wireless|wlan|lan|local area)/i;
const VIRTUAL_INTERFACE_NAME_PATTERN =
    /(?:bluetooth|container|docker|hamachi|hyper-v|loopback|npcap|pseudo|tap|tailscale|teredo|tunnel|tun|virtual|vmware|vbox|virtualbox|vpn|wireguard|wsl|zerotier)/i;
const VIRTUAL_MAC_PREFIXES = new Set([
    '00:05:69',
    '00:0c:29',
    '00:15:5d',
    '00:16:3e',
    '00:1c:14',
    '00:50:56',
    '08:00:27',
    '52:54:00',
]);

import type { ServerResponse } from 'node:http';
import type { NetworkInterfaceInfo } from 'node:os';

function contentTypeFor(filePath: string) {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
        case '.html':
            return 'text/html; charset=utf-8';
        case '.js':
        case '.cjs':
            return 'application/javascript; charset=utf-8';
        case '.css':
            return 'text/css; charset=utf-8';
        case '.json':
            return 'application/json; charset=utf-8';
        case '.svg':
            return 'image/svg+xml';
        default:
            return 'application/octet-stream';
    }
}

function getAdvertisedUrls(port: number) {
    const candidates: { index: number; score: number; url: string }[] = [];
    const interfaces = os.networkInterfaces();
    let index = 0;

    for (const [name, entries] of Object.entries(interfaces) as [
        string,
        NetworkInterfaceInfo[] | undefined,
    ][]) {
        if (!entries) {
            continue;
        }

        for (const entry of entries) {
            if (!isUsableIpv4Entry(entry)) {
                continue;
            }

            candidates.push({
                index,
                score: scoreIpv4Entry(name, entry),
                url: `http://${entry.address}:${port}${REMOTE_BASE_PATH}`,
            });
            index += 1;
        }
    }

    const urls = candidates
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map((candidate) => candidate.url);

    urls.unshift(`http://localhost:${port}${REMOTE_BASE_PATH}`);
    return Array.from(new Set(urls));
}

function isUsableIpv4Entry(entry: NetworkInterfaceInfo) {
    return Boolean(
        entry && !entry.internal && isIpv4Family(entry.family) && parseIpv4(entry.address),
    );
}

function isIpv4Family(family: string | number) {
    return family === 'IPv4' || family === 4;
}

function scoreIpv4Entry(name: string, entry: NetworkInterfaceInfo) {
    const octets = parseIpv4(entry.address) as number[];
    let score = 0;

    if (isPrivateIpv4(octets)) {
        score += 1000;
    }

    if (octets[0] === 192 && octets[1] === 168) {
        score += 40;
    } else if (octets[0] === 10) {
        score += 30;
    } else if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
        score += 20;
    }

    if (PHYSICAL_INTERFACE_NAME_PATTERN.test(name)) {
        score += 120;
    }

    if (VIRTUAL_INTERFACE_NAME_PATTERN.test(name)) {
        score -= 700;
    }

    if (isVirtualMac(entry.mac)) {
        score -= 450;
    }

    if (isLinkLocalIpv4(octets)) {
        score -= 1200;
    }

    if (octets[3] === 1 || octets[3] === 254) {
        score -= 25;
    }

    return score;
}

function parseIpv4(address: unknown): number[] | null {
    if (typeof address !== 'string') {
        return null;
    }

    const match = address.match(IPV4_OCTET_PATTERN);
    if (!match) {
        return null;
    }

    const octets = match.slice(1).map((part) => Number(part));
    return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
        ? octets
        : null;
}

function isPrivateIpv4(octets: number[]) {
    return (
        octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)
    );
}

function isLinkLocalIpv4(octets: number[]) {
    return octets[0] === 169 && octets[1] === 254;
}

function isVirtualMac(mac: unknown) {
    if (typeof mac !== 'string') {
        return false;
    }

    return VIRTUAL_MAC_PREFIXES.has(mac.toLowerCase().slice(0, 8));
}

// Async on purpose: this runs on the same event loop as every live WebSocket client,
// so a blocking read would stall trainer updates for everyone.
/**
 * Resolves a request path inside `root`, or null when it escapes.
 * Today's routing happens to be safe only because pathnames are never percent-decoded;
 * decoding without this check would turn `%2e%2e%2f` into a real traversal.
 */
function resolveInsideRoot(root: string, relativePath: string): string | null {
    const decoded = safeDecode(relativePath);
    if (decoded === null || decoded.indexOf('\0') >= 0) {
        return null;
    }

    const resolvedRoot = path.resolve(root);
    const candidate = path.resolve(resolvedRoot, `.${path.sep}${decoded}`);
    const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;

    return candidate === resolvedRoot || candidate.startsWith(prefix) ? candidate : null;
}

function safeDecode(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}

async function serveFile(response: ServerResponse, filePath: string | null) {
    if (filePath === null) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }

    try {
        const content = await fs.promises.readFile(filePath);
        response.writeHead(200, {
            'Content-Type': contentTypeFor(filePath),
            'Cache-Control': 'no-store',
        });
        response.end(content);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    }
}

module.exports = {
    getAdvertisedUrls,
    resolveInsideRoot,
    serveFile,
};
