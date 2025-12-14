        // ARCHITECTURE: Index 0 is always now-playing
        // NEW PRIORITY QUEUE LOGIC:
        // 1. Check if current video at index 0 was from priority queue - if so, remove it (don't recycle)
        // 2. BEFORE moving index 0 to end, insert priority video into index 1 if available
        // 3. Move index 0 to end (recycle) - but ONLY if it was from active queue
        // 4. The new index 0 becomes the next video to play
        
        if (queueState.activeQueue.length > 0) {
          const currentVideoAt0 = queueState.activeQueue[0];
          const wasFromPriority = queueState.nowPlayingSource === 'priority';
          
          // Step 1: Handle the current video at index 0
          if (wasFromPriority) {
            // Current video was from priority queue - remove it entirely (don't recycle)
            console.log('[main] 🗑️ Removing priority queue video (not recycling):', currentVideoAt0?.title);
            queueState.activeQueue.shift(); // Remove from index 0
          }
          
          // Step 2: BEFORE moving index 0 to end, insert priority video into index 1 if available
          let priorityVideoInserted = false;
          if (queueState.priorityQueue.length > 0) {
            const priorityVideo = queueState.priorityQueue.shift();
            console.log('[main] 📥 Inserting priority video into index 1:', priorityVideo?.title, 'Remaining priority:', queueState.priorityQueue.length);
            queueState.activeQueue.splice(1, 0, priorityVideo); // Insert at index 1
            priorityVideoInserted = true;
          }
          
          // Step 3: Move index 0 to end (recycle) - but ONLY if it was from active queue
          if (!wasFromPriority && queueState.activeQueue.length > 0) {
            const currentVideo = queueState.activeQueue.shift(); // Remove from index 0
            queueState.activeQueue.push(currentVideo); // Add to end (recycle)
            console.log('[main] ♻️ Recycled active queue video to end:', currentVideo?.title);
          }
          
          // Step 4: The new index 0 is now the next video to play
          const nextVideo = queueState.activeQueue[0];
          
          if (nextVideo) {
            // Determine source: if we inserted a priority video, it's now at index 0
            queueState.nowPlaying = nextVideo;
            queueState.nowPlayingSource = priorityVideoInserted ? 'priority' : 'active';
            queueState.isPlaying = true;
            console.log('[main] 🎬 Next video:', nextVideo.title, 'Source:', queueState.nowPlayingSource);
            
            if (fullscreenWindow) {
              fullscreenWindow.webContents.send('control-player', { action: 'play', data: nextVideo });
            }
          } else {
            // Queue is empty
            queueState.nowPlaying = null;
            queueState.nowPlayingSource = null;
            queueState.isPlaying = false;
            console.log('[main] ⚠️ Queue is empty after next command');
          }
        } else if (queueState.priorityQueue.length > 0) {
          // Active queue is empty, but priority queue has items
          const priorityVideo = queueState.priorityQueue.shift();
          console.log('[main] 🎬 Playing priority video (active queue empty):', priorityVideo?.title);
          queueState.nowPlaying = priorityVideo;
          queueState.nowPlayingSource = 'priority';
          queueState.isPlaying = true;
          
          // Insert into active queue at index 0
          queueState.activeQueue.push(priorityVideo);
          
          if (fullscreenWindow) {
            fullscreenWindow.webContents.send('control-player', { action: 'play', data: priorityVideo });
          }
        } else {
          // No videos in either queue
          queueState.nowPlaying = null;
          queueState.nowPlayingSource = null;
          queueState.isPlaying = false;
          console.log('[main] ⚠️ Both queues are empty');
        }

