import React, { useState, useEffect, useMemo } from 'react';
import { unifiedAPI } from '../../../services/UnifiedAPI';
import { cleanVideoTitle, getDisplayArtist, getPlaylistDisplayName, formatDuration } from '../../../utils/playlistHelpers';
import type { Video } from '../../../types';

interface SearchInterfaceProps {
  playlists: Record<string, Video[]>;
  onCommand: (command: string, data?: any) => Promise<void>;
  selectedPlaylist?: string | null;
}

export const SearchInterface: React.FC<SearchInterfaceProps> = ({
  playlists,
  onCommand,
  selectedPlaylist: propSelectedPlaylist = null
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Video[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchScope, setSearchScope] = useState<'all' | 'playlist' | 'karaoke' | 'no-karaoke'>('all');
  const [searchSort, setSearchSort] = useState<'artist' | 'az' | 'title' | 'playlist'>('artist');
  const [searchLimit, setSearchLimit] = useState(100);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(propSelectedPlaylist);

  // Update selectedPlaylist when prop changes
  useEffect(() => {
    if (propSelectedPlaylist) {
      setSelectedPlaylist(propSelectedPlaylist);
      setSearchScope('playlist');
    }
  }, [propSelectedPlaylist]);

  // Get all videos from playlists
  const allVideos = useMemo(() => {
    const videos = Object.values(playlists).flat();
    const seen = new Set<string>();
    return videos.filter(video => {
      const key = video.path || video.src || `${video.title}|${video.artist}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playlists]);

  // Perform search
  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim()) {
        // If no search query, show videos based on scope
        let videos: Video[] = [];
        
        if (searchScope === 'playlist' && selectedPlaylist) {
          videos = playlists[selectedPlaylist] || [];
        } else if (searchScope === 'karaoke') {
          videos = allVideos.filter(v => v.title?.toLowerCase().includes('karaoke') || v.artist?.toLowerCase().includes('karaoke'));
        } else if (searchScope === 'no-karaoke') {
          videos = allVideos.filter(v => !v.title?.toLowerCase().includes('karaoke') && !v.artist?.toLowerCase().includes('karaoke'));
        } else {
          videos = allVideos;
        }

        // Sort videos
        const sorted = [...videos].sort((a, b) => {
          switch (searchSort) {
            case 'artist':
              return (a.artist || '').localeCompare(b.artist || '');
            case 'az':
            case 'title':
              return (a.title || '').localeCompare(b.title || '');
            case 'playlist':
              return (a.playlist || '').localeCompare(b.playlist || '');
            default:
              return 0;
          }
        });

        setSearchResults(sorted);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const results = await unifiedAPI.searchVideos(searchQuery);
        
        // Apply scope filter
        let filtered = results;
        if (searchScope === 'playlist' && selectedPlaylist) {
          filtered = results.filter(v => v.playlist === selectedPlaylist);
        } else if (searchScope === 'karaoke') {
          filtered = results.filter(v => v.title?.toLowerCase().includes('karaoke') || v.artist?.toLowerCase().includes('karaoke'));
        } else if (searchScope === 'no-karaoke') {
          filtered = results.filter(v => !v.title?.toLowerCase().includes('karaoke') && !v.artist?.toLowerCase().includes('karaoke'));
        }

        // Sort results
        const sorted = [...filtered].sort((a, b) => {
          switch (searchSort) {
            case 'artist':
              return (a.artist || '').localeCompare(b.artist || '');
            case 'az':
            case 'title':
              return (a.title || '').localeCompare(b.title || '');
            case 'playlist':
              return (a.playlist || '').localeCompare(b.playlist || '');
            default:
              return 0;
          }
        });

        setSearchResults(sorted);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, searchScope, searchSort, selectedPlaylist, playlists, allVideos]);

  const handleVideoClick = async (video: Video, event: React.MouseEvent) => {
    event.stopPropagation();
    await onCommand('queue_add', {
      video: {
        id: video.id,
        title: video.title,
        artist: video.artist,
        src: video.src,
        path: video.path,
        duration: video.duration,
        playlist: video.playlist,
        playlistDisplayName: video.playlistDisplayName
      },
      queueType: 'priority'
    });
  };

  const handleScopeChange = (scope: 'all' | 'playlist' | 'karaoke' | 'no-karaoke') => {
    setSearchScope(scope);
    setSearchLimit(100);
    if (scope !== 'playlist') setSelectedPlaylist(null);
  };

  // Helper to get playlist display name for selected playlist
  const getSelectedPlaylistDisplayName = () => {
    if (!selectedPlaylist) return '';
    return playlists[selectedPlaylist]?.[0]?.playlistDisplayName || getPlaylistDisplayName(selectedPlaylist);
  };

  const searchTotalCount = searchResults.length;
  const displayedResults = searchResults.slice(0, searchLimit);

  return (
    <div className="tab-content active">
      <div className="search-header" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <div className="search-input-container" style={{ flex: '1 1 300px', minWidth: '200px', position: 'relative' }}>
          <span className="material-symbols-rounded" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ytm-text-secondary)' }}>search</span>
          <input
            type="text"
            placeholder="Search all music…"
            className="search-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchLimit(100);
            }}
            style={{
              width: '100%',
              padding: '8px 12px 8px 40px',
              backgroundColor: 'var(--ytm-surface)',
              border: '1px solid var(--ytm-divider)',
              borderRadius: '4px',
              color: 'var(--ytm-text)',
              fontSize: '14px'
            }}
          />
          {isSearching && <span className="material-symbols-rounded" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite' }}>progress_activity</span>}
        </div>
        <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--ytm-text-secondary)', fontSize: '12px', marginRight: '4px' }}>Filter:</span>
          {selectedPlaylist && (
            <button
              className={`radio-btn ${searchScope === 'playlist' ? 'active' : ''}`}
              onClick={() => handleScopeChange('playlist')}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                backgroundColor: searchScope === 'playlist' ? 'var(--ytm-accent)' : 'transparent',
                color: searchScope === 'playlist' ? 'white' : 'var(--ytm-text-secondary)',
                border: '1px solid var(--ytm-divider)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: searchScope === 'playlist' ? 'bold' : 'normal'
              }}
            >
              📁 {getSelectedPlaylistDisplayName()}
            </button>
          )}
          <button
            className={`radio-btn ${searchScope === 'all' ? 'active' : ''}`}
            onClick={() => handleScopeChange('all')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: searchScope === 'all' ? 'var(--ytm-accent)' : 'transparent',
              color: searchScope === 'all' ? 'white' : 'var(--ytm-text-secondary)',
              border: '1px solid var(--ytm-divider)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            All Music
          </button>
          <button
            className={`radio-btn ${searchScope === 'karaoke' ? 'active' : ''}`}
            onClick={() => handleScopeChange('karaoke')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: searchScope === 'karaoke' ? 'var(--ytm-accent)' : 'transparent',
              color: searchScope === 'karaoke' ? 'white' : 'var(--ytm-text-secondary)',
              border: '1px solid var(--ytm-divider)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Karaoke Only
          </button>
          <button
            className={`radio-btn ${searchScope === 'no-karaoke' ? 'active' : ''}`}
            onClick={() => handleScopeChange('no-karaoke')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: searchScope === 'no-karaoke' ? 'var(--ytm-accent)' : 'transparent',
              color: searchScope === 'no-karaoke' ? 'white' : 'var(--ytm-text-secondary)',
              border: '1px solid var(--ytm-divider)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Hide Karaoke
          </button>
        </div>
        <div className="search-radio-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--ytm-text-secondary)', fontSize: '12px', marginRight: '4px' }}>Sort:</span>
          <button
            className={`radio-btn ${searchSort === 'artist' ? 'active' : ''}`}
            onClick={() => setSearchSort('artist')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: searchSort === 'artist' ? 'var(--ytm-accent)' : 'transparent',
              color: searchSort === 'artist' ? 'white' : 'var(--ytm-text-secondary)',
              border: '1px solid var(--ytm-divider)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Artist
          </button>
          <button
            className={`radio-btn ${searchSort === 'az' || searchSort === 'title' ? 'active' : ''}`}
            onClick={() => setSearchSort('az')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: (searchSort === 'az' || searchSort === 'title') ? 'var(--ytm-accent)' : 'transparent',
              color: (searchSort === 'az' || searchSort === 'title') ? 'white' : 'var(--ytm-text-secondary)',
              border: '1px solid var(--ytm-divider)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Song
          </button>
          <button
            className={`radio-btn ${searchSort === 'playlist' ? 'active' : ''}`}
            onClick={() => setSearchSort('playlist')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: searchSort === 'playlist' ? 'var(--ytm-accent)' : 'transparent',
              color: searchSort === 'playlist' ? 'white' : 'var(--ytm-text-secondary)',
              border: '1px solid var(--ytm-divider)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Playlist
          </button>
        </div>
      </div>
      <div className="table-container" style={{ overflowX: 'auto' }}>
        <table className="media-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--ytm-divider)' }}>
              <th className="col-index" style={{ textAlign: 'left', padding: '12px', fontSize: '12px', fontWeight: '600', color: 'var(--ytm-text-secondary)', width: '60px' }}>#</th>
              <th className="col-title" style={{ textAlign: 'left', padding: '12px', fontSize: '12px', fontWeight: '600', color: 'var(--ytm-text-secondary)' }}>Title</th>
              <th className="col-artist" style={{ textAlign: 'left', padding: '12px', fontSize: '12px', fontWeight: '600', color: 'var(--ytm-text-secondary)' }}>Artist</th>
              <th className="col-duration" style={{ textAlign: 'left', padding: '12px', fontSize: '12px', fontWeight: '600', color: 'var(--ytm-text-secondary)', width: '80px' }}>Duration</th>
              <th className="col-playlist" style={{ textAlign: 'left', padding: '12px', fontSize: '12px', fontWeight: '600', color: 'var(--ytm-text-secondary)' }}>Playlist</th>
            </tr>
          </thead>
          <tbody>
            {isSearching && displayedResults.length === 0 ? (
              <tr className="empty-state">
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--ytm-text-secondary)' }}>Loading...</td>
              </tr>
            ) : displayedResults.length === 0 ? (
              <tr className="empty-state">
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--ytm-text-secondary)' }}>
                  {searchScope === 'playlist' && selectedPlaylist ? 'No tracks in this playlist' : 'No tracks found'}
                </td>
              </tr>
            ) : (
              displayedResults.map((track, index) => (
                <tr 
                  key={`${track.id}-${index}`} 
                  onClick={(e) => handleVideoClick(track, e)} 
                  style={{ 
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--ytm-divider)',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--ytm-surface-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <td style={{ padding: '12px', fontSize: '14px', color: 'var(--ytm-text-secondary)' }}>{index + 1}</td>
                  <td className="col-title" style={{ padding: '12px', fontSize: '14px', fontWeight: '500', color: 'var(--ytm-text)' }}>{cleanVideoTitle(track.title)}</td>
                  <td style={{ padding: '12px', fontSize: '14px', color: 'var(--ytm-text-secondary)' }}>{getDisplayArtist(track.artist)}</td>
                  <td style={{ padding: '12px', fontSize: '14px', color: 'var(--ytm-text-secondary)' }}>{formatDuration(track.duration)}</td>
                  <td style={{ padding: '12px', fontSize: '14px', color: 'var(--ytm-text-secondary)' }}>{track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {searchTotalCount > displayedResults.length && (
          <div className="load-more-container" style={{ padding: '12px', textAlign: 'center' }}>
            <button 
              className="action-btn"
              onClick={() => setSearchLimit(prev => prev + 100)}
              style={{
                marginRight: '8px',
                padding: '8px 16px',
                backgroundColor: 'var(--ytm-accent)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
              disabled={isSearching}
            >
              {isSearching ? 'Loading...' : `Load More (${searchTotalCount - displayedResults.length} remaining)`}
            </button>
            <span style={{ color: 'var(--ytm-text-secondary)', fontSize: '12px' }}>
              Showing {displayedResults.length} of {searchTotalCount} tracks
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
