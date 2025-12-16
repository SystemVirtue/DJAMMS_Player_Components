// src/components/tabs/SearchTab.tsx
import React from 'react';
import { Video } from '../../types';
import { cleanVideoTitle, getDisplayArtist, getPlaylistDisplayName, formatDuration } from '../../utils/playlistHelpers';

interface SearchTabProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchLoading: boolean;
  searchScope: string;
  handleScopeChange: (scope: string) => void;
  selectedPlaylist: string | null;
  playlists: Record<string, Video[]>;
  searchSort: string;
  setSearchSort: (sort: string) => void;
  searchResults: Video[];
  handleVideoClick: (video: Video, event: React.MouseEvent) => void;
  searchTotalCount: number;
  searchLimit: number;
  setSearchLimit: (limit: number | ((prev: number) => number)) => void;
}

export const SearchTab: React.FC<SearchTabProps> = ({
  searchQuery,
  setSearchQuery,
  searchLoading,
  searchScope,
  handleScopeChange,
  selectedPlaylist,
  playlists,
  searchSort,
  setSearchSort,
  searchResults,
  handleVideoClick,
  searchTotalCount,
  searchLimit,
  setSearchLimit
}) => {

  // Helper to get playlist display name for selected playlist
  const getSelectedPlaylistDisplayName = () => {
    if (!selectedPlaylist) return '';
    return playlists[selectedPlaylist]?.[0]?.playlistDisplayName || selectedPlaylist.replace(/^PL[A-Za-z0-9_-]+[._]/, '');
  };

  return (
    <div className="tab-content active">
      <div className="search-header" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <div className="search-input-container" style={{ flex: '1 1 300px', minWidth: '200px' }}>
          <span className="material-symbols-rounded search-icon">search</span>
          <input
            type="text"
            placeholder="Search all music…"
            className="search-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchLimit(100); // Reset pagination on new search
            }}
          />
          {searchLoading && <span className="material-symbols-rounded loading-icon" style={{ marginLeft: '8px', animation: 'spin 1s linear infinite' }}>progress_activity</span>}
        </div>
        <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginRight: '4px' }}>Filter:</span>
          {selectedPlaylist && (
            <button
              className={`radio-btn ${searchScope === 'playlist' ? 'active' : ''}`}
              onClick={() => handleScopeChange('playlist')}
              style={{ fontWeight: searchScope === 'playlist' ? 'bold' : 'normal' }}
            >
              📁 {getSelectedPlaylistDisplayName()}
            </button>
          )}
          <button
            className={`radio-btn ${searchScope === 'all' ? 'active' : ''}`}
            onClick={() => handleScopeChange('all')}
          >
            All Music
          </button>
          <button
            className={`radio-btn ${searchScope === 'karaoke' ? 'active' : ''}`}
            onClick={() => handleScopeChange('karaoke')}
          >
            Karaoke Only
          </button>
          <button
            className={`radio-btn ${searchScope === 'no-karaoke' ? 'active' : ''}`}
            onClick={() => handleScopeChange('no-karaoke')}
          >
            Hide Karaoke
          </button>
        </div>
        <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px', marginRight: '4px' }}>Sort:</span>
          <button
            className={`radio-btn ${searchSort === 'artist' ? 'active' : ''}`}
            onClick={() => setSearchSort('artist')}
          >
            Artist
          </button>
          <button
            className={`radio-btn ${searchSort === 'az' || searchSort === 'title' ? 'active' : ''}`}
            onClick={() => setSearchSort('az')}
          >
            Song
          </button>
          <button
            className={`radio-btn ${searchSort === 'playlist' ? 'active' : ''}`}
            onClick={() => setSearchSort('playlist')}
          >
            Playlist
          </button>
        </div>
      </div>
      <div className="table-container">
        <table className="media-table">
          <thead>
            <tr>
              <th className="col-index">#</th>
              <th className="col-title">Title</th>
              <th className="col-artist">Artist</th>
              <th className="col-duration">Duration</th>
              <th className="col-playlist">Playlist</th>
            </tr>
          </thead>
          <tbody>
            {searchLoading && searchResults.length === 0 ? (
              <tr className="empty-state">
                <td colSpan={5}>Loading...</td>
              </tr>
            ) : searchResults.length === 0 ? (
              <tr className="empty-state">
                <td colSpan={5}>
                  {searchScope === 'playlist' && selectedPlaylist ? 'No tracks in this playlist' : 'No tracks found'}
                </td>
              </tr>
            ) : (
              searchResults.slice(0, searchLimit).map((track, index) => (
                <tr key={`${track.id}-${index}`} onClick={(e) => handleVideoClick(track, e)} style={{ cursor: 'pointer' }}>
                  <td>{index + 1}</td>
                  <td className="col-title">{cleanVideoTitle(track.title)}</td>
                  <td>{getDisplayArtist(track.artist)}</td>
                  <td>{formatDuration(track.duration)}</td>
                  <td>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {searchTotalCount > searchResults.length && (
          <div className="load-more-container" style={{ padding: '12px', textAlign: 'center' }}>
            <button 
              className="action-btn"
              onClick={() => setSearchLimit(prev => prev + 100)}
              style={{ marginRight: '8px' }}
              disabled={searchLoading}
            >
              {searchLoading ? 'Loading...' : `Load More (${searchTotalCount - searchResults.length} remaining)`}
            </button>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              Showing {searchResults.length} of {searchTotalCount} tracks
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

