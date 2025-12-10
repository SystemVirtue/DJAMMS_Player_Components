/**
 * QueueService Unit Tests
 * Tests queue rotation logic, recycle behavior, and edge cases
 */

import { QueueService, getQueueService } from '../src/services/QueueService';
import { Video } from '../src/types';

// Mock SupabaseService to avoid dependencies
jest.mock('../src/services/SupabaseService', () => ({
  getSupabaseService: jest.fn(() => ({
    initialized: false, // Disable sync for tests
    syncPlayerState: jest.fn()
  }))
}));

describe('QueueService', () => {
  let queueService: QueueService;
  
  // Helper to create test videos
  const createVideo = (id: string, title: string): Video => ({
    id,
    title,
    artist: 'Test Artist',
    src: `file:///test/${id}.mp4`,
    path: `/test/${id}.mp4`
  });

  beforeEach(() => {
    // Get fresh instance for each test
    queueService = getQueueService();
    queueService.initialize([], []);
  });

  describe('Initialization', () => {
    it('should initialize with empty queues', () => {
      const state = queueService.getState();
      expect(state.activeQueue).toEqual([]);
      expect(state.priorityQueue).toEqual([]);
      expect(state.nowPlaying).toBeNull();
      expect(state.nowPlayingSource).toBeNull();
    });

    it('should initialize with provided queues', () => {
      const active = [createVideo('1', 'Active 1'), createVideo('2', 'Active 2')];
      const priority = [createVideo('3', 'Priority 1')];
      
      queueService.initialize(active, priority);
      const state = queueService.getState();
      
      expect(state.activeQueue).toHaveLength(2);
      expect(state.priorityQueue).toHaveLength(1);
    });

    it('should return singleton instance', () => {
      const instance1 = getQueueService();
      const instance2 = getQueueService();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Queue Management', () => {
    it('should add video to active queue', () => {
      const video = createVideo('1', 'Test Video');
      queueService.addToActiveQueue(video);
      
      expect(queueService.activeQueueLength).toBe(1);
      expect(queueService.getState().activeQueue[0]).toEqual(video);
    });

    it('should add video to active queue at specific position', () => {
      const v1 = createVideo('1', 'First');
      const v2 = createVideo('2', 'Second');
      const v3 = createVideo('3', 'Third');
      
      queueService.addToActiveQueue(v1);
      queueService.addToActiveQueue(v2);
      queueService.addToActiveQueue(v3, 1); // Insert at position 1
      
      const state = queueService.getState();
      expect(state.activeQueue[0].id).toBe('1');
      expect(state.activeQueue[1].id).toBe('3');
      expect(state.activeQueue[2].id).toBe('2');
    });

    it('should add video to priority queue', () => {
      const video = createVideo('1', 'Priority Video');
      queueService.addToPriorityQueue(video);
      
      expect(queueService.priorityQueueLength).toBe(1);
      expect(queueService.getState().priorityQueue[0]).toEqual(video);
    });

    it('should remove video from active queue by index', () => {
      const v1 = createVideo('1', 'First');
      const v2 = createVideo('2', 'Second');
      
      queueService.addToActiveQueue(v1);
      queueService.addToActiveQueue(v2);
      
      const removed = queueService.removeFromActiveQueue(0);
      expect(removed).toEqual(v1);
      expect(queueService.activeQueueLength).toBe(1);
      expect(queueService.getState().activeQueue[0]).toEqual(v2);
    });

    it('should return null when removing invalid index', () => {
      const removed = queueService.removeFromActiveQueue(0);
      expect(removed).toBeNull();
    });

    it('should clear active queue', () => {
      queueService.addToActiveQueue(createVideo('1', 'Test'));
      queueService.clearActiveQueue();
      expect(queueService.activeQueueLength).toBe(0);
    });

    it('should clear priority queue', () => {
      queueService.addToPriorityQueue(createVideo('1', 'Test'));
      queueService.clearPriorityQueue();
      expect(queueService.priorityQueueLength).toBe(0);
    });
  });

  describe('Queue Rotation', () => {
    it('should prioritize priority queue over active queue', () => {
      const active = [createVideo('1', 'Active 1')];
      const priority = [createVideo('2', 'Priority 1')];
      
      queueService.initialize(active, priority);
      const result = queueService.rotateQueue();
      
      expect(result.nextVideo?.id).toBe('2');
      expect(result.source).toBe('priority');
      expect(queueService.priorityQueueLength).toBe(0);
      expect(queueService.activeQueueLength).toBe(1); // Active queue untouched
    });

    it('should play from active queue when priority is empty', () => {
      const active = [createVideo('1', 'Active 1'), createVideo('2', 'Active 2')];
      
      queueService.initialize(active, []);
      const result = queueService.rotateQueue();
      
      expect(result.nextVideo?.id).toBe('1');
      expect(result.source).toBe('active');
      expect(queueService.activeQueueLength).toBe(1); // First item removed
    });

    it('should recycle active queue items to end', () => {
      const active = [createVideo('1', 'Active 1'), createVideo('2', 'Active 2')];
      
      queueService.initialize(active, []);
      
      // First rotation
      const result1 = queueService.rotateQueue();
      expect(result1.nextVideo?.id).toBe('1');
      expect(queueService.activeQueueLength).toBe(1);
      
      // Second rotation - should play '2', then '1' should be at end
      const result2 = queueService.rotateQueue();
      expect(result2.nextVideo?.id).toBe('2');
      expect(queueService.activeQueueLength).toBe(1);
      
      // Third rotation - should play recycled '1'
      const result3 = queueService.rotateQueue();
      expect(result3.nextVideo?.id).toBe('1');
    });

    it('should NOT recycle priority queue items', () => {
      const priority = [createVideo('1', 'Priority 1'), createVideo('2', 'Priority 2')];
      
      queueService.initialize([], priority);
      
      // First rotation
      const result1 = queueService.rotateQueue();
      expect(result1.nextVideo?.id).toBe('1');
      expect(queueService.priorityQueueLength).toBe(1);
      
      // Second rotation
      const result2 = queueService.rotateQueue();
      expect(result2.nextVideo?.id).toBe('2');
      expect(queueService.priorityQueueLength).toBe(0);
      
      // Third rotation - should be null (priority items not recycled)
      const result3 = queueService.rotateQueue();
      expect(result3.nextVideo).toBeNull();
    });

    it('should return null when both queues are empty', () => {
      const result = queueService.rotateQueue();
      expect(result.nextVideo).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should update nowPlaying state after rotation', () => {
      const active = [createVideo('1', 'Active 1')];
      queueService.initialize(active, []);
      
      queueService.rotateQueue();
      const state = queueService.getState();
      
      expect(state.nowPlaying?.id).toBe('1');
      expect(state.nowPlayingSource).toBe('active');
    });
  });

  describe('Start Playback', () => {
    it('should start with priority queue if available', () => {
      const active = [createVideo('1', 'Active 1')];
      const priority = [createVideo('2', 'Priority 1')];
      
      queueService.initialize(active, priority);
      const result = queueService.startPlayback();
      
      expect(result.nextVideo?.id).toBe('2');
      expect(result.source).toBe('priority');
    });

    it('should start with active queue if priority is empty', () => {
      const active = [createVideo('1', 'Active 1')];
      queueService.initialize(active, []);
      
      const result = queueService.startPlayback();
      expect(result.nextVideo?.id).toBe('1');
      expect(result.source).toBe('active');
    });

    it('should not recycle on start playback', () => {
      const active = [createVideo('1', 'Active 1')];
      queueService.initialize(active, []);
      
      queueService.startPlayback();
      // After start, the video should be removed but not recycled
      expect(queueService.activeQueueLength).toBe(0);
    });
  });

  describe('Peek Next', () => {
    it('should peek priority queue first', () => {
      const active = [createVideo('1', 'Active 1')];
      const priority = [createVideo('2', 'Priority 1')];
      
      queueService.initialize(active, priority);
      const peek = queueService.peekNext();
      
      expect(peek.video?.id).toBe('2');
      expect(peek.source).toBe('priority');
      // Queue should not be modified
      expect(queueService.priorityQueueLength).toBe(1);
    });

    it('should peek active queue when priority is empty', () => {
      const active = [createVideo('1', 'Active 1')];
      queueService.initialize(active, []);
      
      const peek = queueService.peekNext();
      expect(peek.video?.id).toBe('1');
      expect(peek.source).toBe('active');
    });

    it('should return null when both queues are empty', () => {
      const peek = queueService.peekNext();
      expect(peek.video).toBeNull();
      expect(peek.source).toBeNull();
    });
  });

  describe('Shuffle', () => {
    it('should shuffle active queue', () => {
      const videos = [
        createVideo('1', 'A'),
        createVideo('2', 'B'),
        createVideo('3', 'C'),
        createVideo('4', 'D')
      ];
      
      queueService.setActiveQueue(videos);
      const originalOrder = queueService.getState().activeQueue.map(v => v.id);
      
      queueService.shuffleActiveQueue();
      const shuffledOrder = queueService.getState().activeQueue.map(v => v.id);
      
      // Should have same length
      expect(shuffledOrder.length).toBe(originalOrder.length);
      // Should contain same items (order may differ)
      expect(shuffledOrder.sort()).toEqual(originalOrder.sort());
    });

    it('should keep first item when shuffling with keepFirst=true', () => {
      const videos = [
        createVideo('1', 'First'),
        createVideo('2', 'Second'),
        createVideo('3', 'Third')
      ];
      
      queueService.setActiveQueue(videos);
      queueService.shuffleActiveQueue(true);
      
      const state = queueService.getState();
      expect(state.activeQueue[0].id).toBe('1'); // First should stay
      expect(state.activeQueue.length).toBe(3);
    });

    it('should not shuffle single-item queue', () => {
      queueService.addToActiveQueue(createVideo('1', 'Only'));
      const before = queueService.getState().activeQueue;
      
      queueService.shuffleActiveQueue();
      const after = queueService.getState().activeQueue;
      
      expect(after).toEqual(before);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty queues gracefully', () => {
      const result = queueService.rotateQueue();
      expect(result.nextVideo).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should handle single-item active queue', () => {
      queueService.addToActiveQueue(createVideo('1', 'Only'));
      
      const result1 = queueService.rotateQueue();
      expect(result1.nextVideo?.id).toBe('1');
      
      // After rotation, queue should be empty
      expect(queueService.activeQueueLength).toBe(0);
      
      // Next rotation should recycle the item
      const result2 = queueService.rotateQueue();
      expect(result2.nextVideo?.id).toBe('1');
      expect(queueService.activeQueueLength).toBe(0); // Recycled item played
    });

    it('should handle rapid priority queue additions', () => {
      queueService.addToPriorityQueue(createVideo('1', 'P1'));
      queueService.addToPriorityQueue(createVideo('2', 'P2'));
      queueService.addToPriorityQueue(createVideo('3', 'P3'));
      
      expect(queueService.priorityQueueLength).toBe(3);
      
      const result1 = queueService.rotateQueue();
      expect(result1.nextVideo?.id).toBe('1');
      
      const result2 = queueService.rotateQueue();
      expect(result2.nextVideo?.id).toBe('2');
    });

    it('should maintain queue order when adding multiple items', () => {
      const videos = [
        createVideo('1', 'First'),
        createVideo('2', 'Second'),
        createVideo('3', 'Third')
      ];
      
      videos.forEach(v => queueService.addToActiveQueue(v));
      const state = queueService.getState();
      
      expect(state.activeQueue[0].id).toBe('1');
      expect(state.activeQueue[1].id).toBe('2');
      expect(state.activeQueue[2].id).toBe('3');
    });

    it('should handle mixed priority and active queue rotation', () => {
      queueService.addToActiveQueue(createVideo('1', 'Active 1'));
      queueService.addToPriorityQueue(createVideo('2', 'Priority 1'));
      queueService.addToActiveQueue(createVideo('3', 'Active 2'));
      
      // First: Priority
      const r1 = queueService.rotateQueue();
      expect(r1.nextVideo?.id).toBe('2');
      expect(r1.source).toBe('priority');
      
      // Second: Active (priority empty)
      const r2 = queueService.rotateQueue();
      expect(r2.nextVideo?.id).toBe('1');
      expect(r2.source).toBe('active');
      
      // Third: Active (recycled '1' should be at end, '3' plays next)
      const r3 = queueService.rotateQueue();
      expect(r3.nextVideo?.id).toBe('3');
    });
  });

  describe('State Getters', () => {
    it('should return correct queue lengths', () => {
      queueService.addToActiveQueue(createVideo('1', 'A1'));
      queueService.addToActiveQueue(createVideo('2', 'A2'));
      queueService.addToPriorityQueue(createVideo('3', 'P1'));
      
      expect(queueService.activeQueueLength).toBe(2);
      expect(queueService.priorityQueueLength).toBe(1);
      expect(queueService.totalQueueLength).toBe(3);
    });

    it('should return current video', () => {
      queueService.addToActiveQueue(createVideo('1', 'Test'));
      queueService.rotateQueue();
      
      const current = queueService.currentVideo;
      expect(current?.id).toBe('1');
    });

    it('should return immutable state copy', () => {
      queueService.addToActiveQueue(createVideo('1', 'Test'));
      const state1 = queueService.getState();
      const state2 = queueService.getState();
      
      // Should be different objects
      expect(state1).not.toBe(state2);
      // But same content
      expect(state1.activeQueue).toEqual(state2.activeQueue);
      
      // Modifying returned state should not affect service
      state1.activeQueue.push(createVideo('2', 'Modified'));
      expect(queueService.activeQueueLength).toBe(1);
    });
  });
});

