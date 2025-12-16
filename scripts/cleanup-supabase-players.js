#!/usr/bin/env node
/**
 * Cleanup Script: Delete All Player Data from Supabase
 * 
 * This script deletes all player-related data from Supabase:
 * - player_state (queues, now-playing)
 * - local_videos (video library)
 * - admin_commands (command history)
 * - io_logs and io_log_sessions (logging)
 * 
 * Usage:
 *   node scripts/cleanup-supabase-players.js
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  console.error('   Set them in .env.local or as environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function cleanupAllPlayers() {
  console.log('🧹 Starting cleanup of all player data from Supabase...\n');

  try {
    // 1. Delete IO logs and sessions
    console.log('1. Deleting IO logs...');
    // Get all log IDs first, then delete
    const { data: allLogs } = await supabase.from('io_logs').select('id');
    if (allLogs && allLogs.length > 0) {
      const { error: ioLogsError } = await supabase
        .from('io_logs')
        .delete()
        .in('id', allLogs.map(log => log.id));
      
      if (ioLogsError) {
        console.warn('   ⚠️  Error deleting io_logs:', ioLogsError.message);
      } else {
        console.log(`   ✅ Deleted ${allLogs.length} IO log entries`);
      }
    } else {
      console.log('   ✅ No IO logs to delete');
    }

    console.log('2. Deleting IO log sessions...');
    const { data: allSessions } = await supabase.from('io_log_sessions').select('session_id');
    if (allSessions && allSessions.length > 0) {
      const { error: sessionsError } = await supabase
        .from('io_log_sessions')
        .delete()
        .in('session_id', allSessions.map(s => s.session_id));
      
      if (sessionsError) {
        console.warn('   ⚠️  Error deleting io_log_sessions:', sessionsError.message);
      } else {
        console.log(`   ✅ Deleted ${allSessions.length} IO log sessions`);
      }
    } else {
      console.log('   ✅ No IO log sessions to delete');
    }

    // 2. Delete admin commands
    console.log('3. Deleting admin commands...');
    const { data: allCommands } = await supabase.from('admin_commands').select('id');
    if (allCommands && allCommands.length > 0) {
      const { error: commandsError } = await supabase
        .from('admin_commands')
        .delete()
        .in('id', allCommands.map(cmd => cmd.id));
      
      if (commandsError) {
        console.warn('   ⚠️  Error deleting admin_commands:', commandsError.message);
      } else {
        console.log(`   ✅ Deleted ${allCommands.length} admin commands`);
      }
    } else {
      console.log('   ✅ No admin commands to delete');
    }

    // 3. Delete local videos
    console.log('4. Deleting local videos...');
    const { data: allVideos } = await supabase.from('local_videos').select('id');
    if (allVideos && allVideos.length > 0) {
      const { error: videosError } = await supabase
        .from('local_videos')
        .delete()
        .in('id', allVideos.map(v => v.id));
      
      if (videosError) {
        console.warn('   ⚠️  Error deleting local_videos:', videosError.message);
      } else {
        console.log(`   ✅ Deleted ${allVideos.length} local videos`);
      }
    } else {
      console.log('   ✅ No local videos to delete');
    }

    // 4. Delete player state (this includes priority_queue with the duplicate issue)
    console.log('5. Deleting player state (including corrupted priority queues)...');
    const { data: allPlayerStates } = await supabase.from('player_state').select('id, player_id');
    if (allPlayerStates && allPlayerStates.length > 0) {
      console.log(`   Found ${allPlayerStates.length} player state record(s):`);
      allPlayerStates.forEach(ps => {
        console.log(`     - Player ID: ${ps.player_id}`);
      });
      
      const { error: playerStateError } = await supabase
        .from('player_state')
        .delete()
        .in('id', allPlayerStates.map(ps => ps.id));
    
    if (playerStateError) {
      console.warn('   ⚠️  Error deleting player_state:', playerStateError.message);
    } else {
      console.log('   ✅ Player state deleted (this clears the corrupted priority queue)');
    }

    // Verify deletion
    console.log('\n📊 Verifying deletion...\n');
    
    const { count: playerStateCount } = await supabase
      .from('player_state')
      .select('*', { count: 'exact', head: true });
    
    const { count: videosCount } = await supabase
      .from('local_videos')
      .select('*', { count: 'exact', head: true });
    
    const { count: commandsCount } = await supabase
      .from('admin_commands')
      .select('*', { count: 'exact', head: true });
    
    const { count: logsCount } = await supabase
      .from('io_logs')
      .select('*', { count: 'exact', head: true });
    
    const { count: sessionsCount } = await supabase
      .from('io_log_sessions')
      .select('*', { count: 'exact', head: true });

    console.log('Remaining records:');
    console.log(`  - player_state: ${playerStateCount || 0}`);
    console.log(`  - local_videos: ${videosCount || 0}`);
    console.log(`  - admin_commands: ${commandsCount || 0}`);
    console.log(`  - io_logs: ${logsCount || 0}`);
    console.log(`  - io_log_sessions: ${sessionsCount || 0}`);

    if (playerStateCount === 0 && videosCount === 0 && commandsCount === 0 && logsCount === 0 && sessionsCount === 0) {
      console.log('\n✅ Cleanup complete! All player data has been deleted.');
      console.log('   The corrupted priority queue with "Air Supply - All Out Of Love" has been cleared.');
    } else {
      console.log('\n⚠️  Some records may still exist. Check the counts above.');
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupAllPlayers()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

