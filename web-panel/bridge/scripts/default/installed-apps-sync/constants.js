export const GLOBAL_FLAG = "__wandInstalledAppsSyncInstalled"
export const BIND_CHANNEL = "wand-remote-set-handler-bind"
export const SYNC_CHANNEL = "wand-remote-installed-apps"
export const TRAINER_SNAPSHOT_CHANNEL = "wand-remote-sync"
export const GAME_STATUS_CHANNEL = "wand-remote-game-status"
export const COMMAND_REQUEST_CHANNEL = "wand-remote-command"
export const COMMAND_RESPONSE_CHANNEL = "wand-remote-command-response"
export const REMOTE_COMMAND_LAUNCH = "launch"
export const REMOTE_COMMAND_STOP = "stop"
export const REMOTE_COMMAND_TRIGGER = "remote"
export const RETRY_DELAY_MS = 1000
export const MAX_BOOTSTRAP_ATTEMPTS = 60
export const SYNC_INTERVAL_MS = 15000
export const OPTIONAL_SERVICES_RETRY_INTERVAL_MS = 1000
export const FOLLOW_UP_SYNC_DELAY_MS = 2500
export const UNAVAILABLE_TITLES_BATCH_SIZE = 250
export const BOOTSTRAP_LOG_THROTTLE_ATTEMPTS = 5
// Wand's webpack module exports the trainer-launch-request class under key `vO`.
// Required so `trainerService.launch(req)` records `getMetadata(vO)` state in Wand. See AGENTS.md "Remote Play".
export const TRAINER_LAUNCH_REQUEST_EXPORT_KEY = "vO"
export const SNAPSHOT_ENTRY_KEY_PREFIX = Object.freeze({
  TITLE: "title:",
  GAME: "game:",
  APP: "app:",
})
export const GAME_LAUNCHED_EVENT = "game-launched"
export const GAME_ENDED_EVENT = "game-ended"
export const SYNTHETIC_SESSION_RUNNING_EVENT = "trainer-running"
export const SYNTHETIC_SESSION_IDLE_EVENT = "trainer-idle"
export const TRAINER_ENDED_EVENT = "trainer-ended"
export const REMOTE_STOP_EVENT = "remote-stop"
export const STEAM_PLATFORM = "steam"
export const STEAM_APP_ID_PATTERN = /^\d+$/
export const WEMOD_STEAM_COMMUNITY_CDN_BASE_URL =
  "https://api-cdn.wemod.com/steam_community"
export const REMOTE_IMAGE_URL_PATTERN = /^https?:\/\//i
export const PROTOCOL_RELATIVE_IMAGE_URL_PATTERN = /^\/\//
export const DATA_IMAGE_URL_PREFIX = "data:image/"
export const MAX_IMAGE_URL_SEARCH_DEPTH = 4
export const SIDEBAR_GAME_ROW_CONTAINER_SELECTOR = ".sidebar-game-row-container"
export const SIDEBAR_GAME_ROW_IMAGE_SELECTOR = ".sidebar-game-row-image"
export const SIDEBAR_GAME_ROW_TITLE_SELECTOR = ".sidebar-game-row-title"
export const SIDEBAR_GAME_ROW_MORE_SELECTOR = ".sidebar-game-row-more"
export const SIDEBAR_GAME_ROW_TOOLTIP_ID_PATTERN =
  /sidebar-game-row-(.+?)-more-button-tooltip/
export const STEAM_APP_ID_FIELD_NAMES = new Set(["steamAppId", "steamAppID"])
export const STEAM_CONTAINER_FIELD_PATTERN = /steam/i
export const STEAM_CONTAINER_ID_FIELD_NAMES = new Set(["appId", "appID", "id"])
export const LOG_PREFIX = "[wand-installed-apps-sync]"
export const LOG_FILE_NAME = "wand-remote-installed-apps-sync.log"
export const EXCLUDED_UNAVAILABLE_TITLE_PLATFORMS = new Set(["standalone"])
export const IMAGE_FIELD_NAMES = [
  "imageUrl",
  "imageURL",
  "iconUrl",
  "iconURL",
  "coverUrl",
  "coverURL",
  "thumbnailUrl",
  "thumbnailURL",
  "logoUrl",
  "logoURL",
  "headerImageUrl",
  "headerImageURL",
  "boxArtUrl",
  "boxartUrl",
  "posterUrl",
  "tileUrl",
  "capsuleUrl",
  "heroUrl",
  "backgroundUrl",
  "image",
  "icon",
  "cover",
  "thumbnail",
  "logo",
  "headerImage",
  "header",
  "boxArt",
  "boxart",
  "poster",
  "tile",
  "capsule",
  "hero",
  "background",
  "large",
  "medium",
  "small",
  "original",
  "source",
  "href",
  "uri",
  "url",
  "src",
]
