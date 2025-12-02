
# 🚀 Phase 3: Supabase Integration and Queue Management System

You are now tasked with implementing the core backend logic, database schema, and the unique player queue management system using Supabase as the single source of truth.

## 1. Supabase Schema Implementation

Implement the following SQL schema in the Supabase console, then create the necessary TypeScript interfaces to interact with these tables in the application.

### A. Core Media & Playlists (Static Data)

```sql
-- Table: media
CREATE TABLE public.media (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    youtube_id varchar(11) UNIQUE NOT NULL,
    title text NOT NULL,
    artist text NOT NULL,
    source_type text NOT NULL CHECK (source_type IN ('local', 'youtube')),
    local_path_base text, -- e.g., 'EASY_LISTENING/[ID_Artist_Title].mp4'
    duration_seconds integer NOT NULL,
    thumbnail_url text, -- Supabase Storage URL or YT URL
    date_indexed timestamp with time zone DEFAULT now()
);

-- Table: playlists
CREATE TABLE public.playlists (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text UNIQUE NOT NULL,
    folder_name text UNIQUE NOT NULL -- Matches local directory name
);

-- Table: playlist_media (Junction Table)
CREATE TABLE public.playlist_media (
    playlist_id uuid REFERENCES public.playlists(id),
    media_id uuid REFERENCES public.media(id),
    sort_order integer NOT NULL,
    PRIMARY KEY (playlist_id, media_id)
);
B. Player State & Active Queue (Real-Time Data)
SQL

-- Table: player_state
-- Tracks the real-time status of the Electron Player instance
CREATE TABLE public.player_state (
    device_id varchar PRIMARY KEY, -- Electron generated UUID or MAC address
    is_playing boolean DEFAULT FALSE NOT NULL,
    current_media_id uuid REFERENCES public.media(id), -- Index #0: Now Playing
    current_timestamp integer DEFAULT 0, -- Playback position in seconds
    active_playlist_id uuid REFERENCES public.playlists(id),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table: active_queue_items
-- Stores the rest of the queue (Index #1 onwards)
CREATE TYPE queue_item_type AS ENUM ('active', 'priority');
CREATE TABLE public.active_queue_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id varchar REFERENCES public.player_state(device_id),
    media_id uuid REFERENCES public.media(id) NOT NULL,
    queue_type queue_item_type NOT NULL, -- 'active' (main queue) or 'priority' (request queue)
    position integer NOT NULL, -- 1, 2, 3... order within its type
    request_user text, -- User/Kiosk who requested (for priority queue)
    UNIQUE (device_id, queue_type, position)
);
C. Commands & Settings
SQL

-- Table: commands
-- Receives instructions from Web Admin/Kiosk (INPUT for Electron Player)
CREATE TABLE public.commands (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id varchar REFERENCES public.player_state(device_id) NOT NULL,
    command_type text NOT NULL, -- e.g., 'play', 'skip', 'queue_add', 'settings_update'
    payload jsonb NOT NULL, -- Data like { "mediaId": "xyz", "targetQueue": "priority" }
    created_at timestamp with time zone DEFAULT now()
);

-- Table: player_settings
CREATE TABLE public.player_settings (
    device_id varchar PRIMARY KEY REFERENCES public.player_state(device_id),
    logo_path text,
    video_scaling_mode text,
    crossfade_duration integer DEFAULT 5
);
2. Electron Application Logic Implementation
A. Supabase Service (src/services/SupabaseService.ts)
Create a singleton service to handle all database interactions, subscriptions, and command processing.

Initialization: Create the Supabase client using environment variables. Get or generate the device_id from electron-store.

State Management: Implement syncPlayerState() and syncActiveQueue() methods to update the database row-by-row whenever the player state changes locally.

Realtime Command Listener:

Subscribe to public.commands where device_id matches the local player's ID.

When a new command is inserted, emit a local Electron event (e.g., ipcRenderer.send('handle-command', payload)).

After processing, the player must delete the command row from the database.

B. Core Queue Management Logic (src/services/QueueService.ts)
This service implements your custom rotation logic, triggered by the video player component's "on end" event.

rotateQueue() Method:

Priority Check: Check active_queue_items for the lowest position where queue_type = 'priority'.

Next Song Selection:

If a Priority Song exists: Set it as the new current_media_id in player_state. Delete the song from active_queue_items.

If NO Priority Song: Set the top Active Song (position = 1, queue_type = 'active') as the new current_media_id.

Recycling: If the finished song was from the 'active' queue, re-insert it into active_queue_items with the new highest position.

Position Update: Crucially, update the position of all remaining active_queue_items (both types) by decrementing them by 1.

Sync: Call SupabaseService.syncPlayerState() and SupabaseService.syncActiveQueue() to commit all changes.

C. Local File Indexing (IPC Handler)
In electron/ipc/handlers.js (or similar):

fs:scan-directory Handler:

Accepts a root directory path (~/PLAYLISTS).

Uses Node.js's fs module to list all subdirectories (playlists) and .mp4 files.

Parses the required metadata (youtube_id, artist, title) from the filename [Youtube_ID, Artist_Name, Song-Title].mp4.

Upsert: Sends this scanned data to SupabaseService to upsert rows into the media, playlists, and playlist_media tables, ensuring the database reflects the local filesystem.

3. Web Endpoints (Admin Console / Search Kiosk)
Implement the front-end logic for the web applications.

A. Admin Console Web UI
Display Status: Subscribe to player_state and active_queue_items via Supabase Realtime (as described in the previous response). This ensures the web UI instantly reflects the Electron Player's status and queue changes.

Controls (Web-to-Electron): When the user clicks "Skip" or "Pause":

The Admin UI constructs a commands object (e.g., { device_id: '...', command_type: 'skip', payload: {} }).

The Admin UI calls SupabaseService.insertCommand(command).

Execution: The Electron Player (via its Realtime Command Listener, see 2.A) receives this new row and executes the action locally.

B. Search Kiosk Web UI
Library Access: Use the standard Supabase client (PostgREST API) to query the read-only media table for search and browse functionality.

Request Mechanism: When a user selects a song and clicks "Request":

The Kiosk constructs a commands object:

JSON

{
  "device_id": "target-player-id",
  "command_type": "queue_add",
  "payload": {
    "mediaId": "xyz-uuid",
    "queueType": "priority",
    "user": "Kiosk-1"
  }
}
The Kiosk calls SupabaseService.insertCommand(command).

Execution: The Electron Player receives the command, calls QueueService.add(mediaId, 'priority'), and then syncs the change to active_queue_items.

Please guide me through setting up the SupabaseService.ts file, focusing first on the Realtime Command Listener and the Player State synchronization logic.