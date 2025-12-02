You are rebuilding an existing local HTML/JS/CSS media player app (Electron or Tauri style) that currently looks like the attached screenshots.

Implement the following UI/UX overhaul EXACTLY. Use only vanilla HTML5, CSS3 (Flexbox/Grid), and vanilla JavaScript (no frameworks unless explicitly stated). Target a dark YouTube Music 2024–2025 desktop aesthetic (black #000000 / #0f0f0f background, #1f1f1f cards, #aaaaaa text, #ffffff primary text, #f11e1e accents for GNR style).

Core Structural Requirements:

1. Remove ALL embedded video/player windows
   - The actual <video> or audio player MUST open in a separate floating/external window only (you may keep the existing external player logic).
   - The main window will NEVER display video playback visually.

2. Full Dark Theme
   - Background: #000000
   - Surface/cards: #121212
   - Elevated surface: #1f1f1f
   - Text primary: #ffffff
   - Text secondary: #aaaaaa
   - Accent: #ff1e56 (GNR hot pink) or #f11e1e (red) for hover/active states

3. Persistent Top Header (always visible, fixed)
   - Height: 90px
   - Layout: Flex row
     ├── Left: App logo or title (optional)
     ├── Center: "Now Playing" info
     │    ├── Large album art thumbnail (72×72px rounded 8px)
     │    ├── Song title (bold, 16px)
     │    ├── Artist (14px, #aaa)
     ├── Right: Player controls (centered vertically)
          ← Prev │ ▶/❚❚ Play/Pause │ Next → │ 🔀 Shuffle │ 🔁 Repeat │ Volume slider
   - Header background: #000000 with subtle bottom border #333 1px

4. Left Collapsible Sidebar (YouTube Music style)
   - Default state: expanded (280px wide)
   - Collapse button top-left (↔ icon) toggles between 72px and 280px)
   - When collapsed: show only icons + tooltips
   - Sections (vertical, no horizontal lines except subtle separators):
     • Navigation Tabs (larger icons/text)
       - 🎵 Queue         (formerly Playlist)
       - 🔍 Search
       - � Browse
       - ⚙️ Settings
       - 🛠 Tools         (new)
     • Separator
     • Playlist Section Header (only visible when expanded)
       - Text: "PLAYLISTS"
       - Current selection highlighted with #1f1f1f background + accent left bar
       - At top of playlist list: special entry "Selected Playlist: DJAMMS_Default" (or currently loaded one) in bold
   - All other playlists listed below, alphabetically, with video count badge

5. Main Content Area (remaining space)
   - Grid layout:
     header (fixed)
     sidebar (280px|72px collapsible
     main view → takes rest of width and full height below header
   - Main view background: #000000

6. Tab Content Specification

   Queue Tab
   - Single scrollable list of current queue (same as old playlist view but full height)
   - Columns: # | Title | Artist | Duration | Playlist badge
   - Currently playing row highlighted with accent background

   Search Tab (real-time)
   - Top bar sticky:
     - Large search input (placeholder "Search all music…")
     - Right side: Scope dropdown [All Music ▼] options:
       • All Music
       • Exclude Karaoke
       • Karaoke Only
       • Current Queue
       • Selected Playlist
     - Sort by dropdown [Relevance ▼] → Artist, Title, Duration, Date Added, A-Z
   - Results appear immediately below as user types (debounced 150ms)
   - Same row layout as Queue tab

   Browse Tab
   - Identical layout to Search tab but pre-filtered to "Selected Playlist" scope by default
   - When user clicks any playlist in sidebar → automatically switch to Browse tab and set scope to that playlist

   Settings Tab
   - Simple key-value form layout for all existing settings + theme selector

   Tools Tab
   - Centered text for now:
     <h2>Toolkit – Coming Soon</h2>
     <p>Batch tag editor, duplicate finder, lyric sync, etc.</p>

7. Responsive Behavior
   - On window < 1000px width → sidebar auto-collapses
   - Header shrinks slightly but remains functional

8. Visual Fidelity Checklist (match YouTube Music exactly)
   - Scrollbars: thin dark (#333 thumb)
   - Hover rows: #1f1f1f background
   - Selected rows: #2d2d2d + left pink accent bar 4px
   - Font: Google Sans / Roboto / system-ui, -apple-system
   - All icons: Material Icons Rounded (use Google Fonts Material Symbols)

Deliverables:
- index.html (complete structure)
- style.css (single file, well-commented)
- main.js (all behavior: sidebar toggle, tab switching, real-time search with debounce, playlist selection → browse, header now-playing update, external player triggers only)
- Keep all existing playback logic that opens external window untouched

Start coding now. Output only complete, runnable files. No explanations.