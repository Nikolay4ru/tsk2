// frontend/src/modules/calls/livekit-call-client.js
// ✅ COMPLETE FIX: Using trackPublications instead of videoTracks
// ✅ COMPLETE FIX: Proper error handling and logging

import { 
  Room, 
  RoomEvent, 
  Track,
  VideoPresets,
  createLocalTracks,
  LocalVideoTrack,
} from 'livekit-client';

class LiveKitCallClient {
  constructor() {
    this.room = null;
    this.localTracks = [];
    this.onRemoteTrackAdded = null;
    this.onRemoteTrackRemoved = null;
    this.onParticipantConnected = null;
    this.onParticipantDisconnected = null;
    this.onCallEnded = null;
  }

  async fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('accessToken');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  async startCall(callId, roomId, participantName, isVideo = true) {
    console.log('🎥 Starting LiveKit call:', { callId, roomId, participantName, isVideo });

    try {
      const response = await this.fetchWithAuth('/api/livekit/token', {
        method: 'POST',
        body: JSON.stringify({
          roomName: roomId,
          participantName,
          participantId: this.getCurrentUserId(),
        }),
      });

      console.log('✅ Got LiveKit response:', response);

      const token = response.token;
      const url = response.url;

      if (typeof token !== 'string' || !token) {
        throw new Error('Invalid token format');
      }

      console.log('✅ Connecting to:', url);

      this.room = new Room({
        adaptiveStream: false,
        dynacast: false,
        videoCaptureDefaults: {
          resolution: {
            width: 640,
            height: 360,
            frameRate: 20,
          },
        },
      });

      this.setupRoomEvents();

      await this.room.connect(url, token);
      console.log('✅ Connected to LiveKit room:', roomId);

      await this.publishLocalTracks(isVideo);

      const localStream = this.getLocalStream();
      console.log('✅ Local stream created with', localStream?.getTracks().length, 'tracks');

      return localStream;

    } catch (error) {
      console.error('❌ Failed to start LiveKit call:', error);
      this.cleanup();
      throw error;
    }
  }

  setupRoomEvents() {
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log('👤 Participant connected:', participant.identity);
      if (this.onParticipantConnected) {
        this.onParticipantConnected(participant);
      }
      
      participant.trackPublications.forEach((publication) => {
        if (publication.track) {
          console.log('📥 Existing track from', participant.identity, ':', publication.kind);
          if (this.onRemoteTrackAdded) {
            this.onRemoteTrackAdded(publication.track, participant);
          }
        }
      });
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log('👋 Participant disconnected:', participant.identity);
      if (this.onParticipantDisconnected) {
        this.onParticipantDisconnected(participant);
      }
    });

    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log('📥 Track subscribed:', track.kind, 'from', participant.identity);
      if (this.onRemoteTrackAdded) {
        this.onRemoteTrackAdded(track, participant);
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      console.log('📤 Track unsubscribed:', track.kind, 'from', participant.identity);
      if (this.onRemoteTrackRemoved) {
        this.onRemoteTrackRemoved(track, participant);
      }
    });

    this.room.on(RoomEvent.TrackMuted, (publication, participant) => {
      console.log('🔇 Track muted:', publication.kind, 'from', participant.identity);
      if (publication.track && this.onRemoteTrackRemoved) {
        this.onRemoteTrackRemoved(publication.track, participant);
      }
    });

    this.room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      console.log('🔊 Track unmuted:', publication.kind, 'from', participant.identity);
      if (publication.track && this.onRemoteTrackAdded) {
        this.onRemoteTrackAdded(publication.track, participant);
      }
    });

    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('📞 Disconnected from room:', reason);
      if (this.onCallEnded) {
        this.onCallEnded();
      }
    });

    this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      console.log('📶 Connection quality:', quality, participant.identity);
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      console.log('🔄 Reconnecting to room...');
    });

    this.room.on(RoomEvent.Reconnected, () => {
      console.log('✅ Reconnected to room');
    });
  }

  /**
   * Replace the current video track with a new processed stream
   * ✅ FIXED: Using trackPublications instead of videoTracks
   */
  async replaceVideoTrack(processedStream) {
    try {
      if (!this.room) {
        console.warn('⚠️ Cannot replace track: room not initialized');
        return;
      }

      if (this.room.state !== 'connected') {
        console.warn('⚠️ Cannot replace track: room not connected (state:', this.room.state + ')');
        return;
      }

      if (!this.room.localParticipant) {
        console.error('❌ Local participant not available');
        return;
      }

      console.log('🎬 Replacing video track with processed stream');

      const newVideoTrack = processedStream.getVideoTracks()[0];
      
      if (!newVideoTrack) {
        console.error('❌ No video track in processed stream');
        return;
      }

      console.log('✅ Found processed video track:', newVideoTrack.label, newVideoTrack.readyState);

      // ✅ FIXED: Use trackPublications instead of videoTracks
      const currentVideoPublication = Array.from(
        this.room.localParticipant.trackPublications.values()
      ).find(pub => pub.kind === 'video');

      if (!currentVideoPublication) {
        console.warn('⚠️ No current video track to replace');
        console.log('Available publications:', Array.from(this.room.localParticipant.trackPublications.values()));
        return;
      }

      console.log('🔄 Current track found:', currentVideoPublication.trackName, 'replacing...');

      // Create new LocalVideoTrack
      const newLocalTrack = new LocalVideoTrack(newVideoTrack, {
        name: 'camera-processed',
      });

      console.log('✅ Created new LocalVideoTrack');

      // Unpublish old track
      await this.room.localParticipant.unpublishTrack(currentVideoPublication.track);
      console.log('✅ Old track unpublished');

      // Publish new processed track
      const publication = await this.room.localParticipant.publishTrack(newLocalTrack, {
        simulcast: false,
        videoCodec: 'h264',
        name: 'camera-processed',
      });

      console.log('✅ New processed track published:', publication.trackSid);

      // Update local tracks array
      const trackIndex = this.localTracks.findIndex(track => track.kind === 'video');
      
      if (trackIndex !== -1) {
        console.log('Stopping old track in localTracks');
        this.localTracks[trackIndex].stop();
        this.localTracks[trackIndex] = newLocalTrack;
      } else {
        this.localTracks.push(newLocalTrack);
      }

      console.log('✅ Video track replaced successfully');
      console.log('🎉 Remote participants should now see your virtual background!');

    } catch (error) {
      console.error('❌ Failed to replace video track:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Restore original video track
   * ✅ FIXED: Using trackPublications instead of videoTracks
   */
  async restoreOriginalVideoTrack(originalStream) {
    try {
      if (!this.room) {
        console.warn('⚠️ Cannot restore track: room not initialized');
        return;
      }

      if (this.room.state !== 'connected') {
        console.warn('⚠️ Cannot restore track: room not connected (state:', this.room.state + ')');
        return;
      }

      if (!this.room.localParticipant) {
        console.error('❌ Local participant not available');
        return;
      }

      console.log('🔄 Restoring original video track');

      const originalTrack = originalStream.getVideoTracks()[0];
      
      if (!originalTrack) {
        console.error('❌ No video track in original stream');
        return;
      }

      console.log('✅ Found original video track:', originalTrack.label, originalTrack.readyState);

      // ✅ FIXED: Use trackPublications instead of videoTracks
      const currentPub = Array.from(
        this.room.localParticipant.trackPublications.values()
      ).find(pub => pub.kind === 'video');
      
      if (currentPub) {
        console.log('🔄 Unpublishing processed track');
        await this.room.localParticipant.unpublishTrack(currentPub.track);
        console.log('✅ Processed track unpublished');
      }

      // Create new LocalVideoTrack from original stream
      const newTrack = new LocalVideoTrack(originalTrack, {
        name: 'camera',
      });

      console.log('✅ Created new LocalVideoTrack from original');

      // Publish original track
      await this.room.localParticipant.publishTrack(newTrack, {
        simulcast: true,
        videoCodec: 'vp8',
        name: 'camera',
      });

      console.log('✅ Original track published');

      // Update local tracks
      const idx = this.localTracks.findIndex(t => t.kind === 'video');
      if (idx !== -1) {
        this.localTracks[idx].stop();
        this.localTracks[idx] = newTrack;
      } else {
        this.localTracks.push(newTrack);
      }

      console.log('✅ Original track restored');
      console.log('🎉 Remote participants should now see your normal video!');

    } catch (error) {
      console.error('❌ Restore track failed:', error);
      console.error('Error details:', error.message);
      throw error;
    }
  }

  async publishLocalTracks(isVideo) {
    try {
      const tracks = await createLocalTracks({
        audio: true,
        video: isVideo ? {
          width: 640,
          height: 360,
          frameRate: 20,
        } : false,
      });

      console.log('🎤📹 Created local tracks:', tracks.length);

      for (const track of tracks) {
        if (track.kind === Track.Kind.Video) {
          await this.room.localParticipant.publishTrack(track, {
            simulcast: false,
            codec: 'h264',
            videoEncoding: {
              maxBitrate: 1_200_000,
              maxFramerate: 25,
              scalabilityMode: 'L1T1',
            },
          });
        } else {
          await this.room.localParticipant.publishTrack(track);
        }

        this.localTracks.push(track);
        console.log('✅ Published', track.kind, 'track');
      }
    } catch (error) {
      console.error('❌ Failed to publish local tracks:', error);
      throw error;
    }
  }

  getCurrentUserId() {
    try {
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
      if (user.id || user.userId) {
        return user.id || user.userId;
      }

      const token = localStorage.getItem('accessToken');
      if (!token) return 'anonymous';

      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.userId || payload.user_id || payload.sub || payload.id || 'anonymous';
    } catch (error) {
      console.warn('Failed to get userId:', error);
      return 'anonymous';
    }
  }

  getLocalStream() {
    const tracks = [];
    
    const videoTrack = this.localTracks.find(t => t.kind === Track.Kind.Video);
    if (videoTrack && videoTrack.mediaStreamTrack) {
      tracks.push(videoTrack.mediaStreamTrack);
      console.log('✅ Added video track to local stream');
    }
    
    const audioTrack = this.localTracks.find(t => t.kind === Track.Kind.Audio);
    if (audioTrack && audioTrack.mediaStreamTrack) {
      tracks.push(audioTrack.mediaStreamTrack);
      console.log('✅ Added audio track to local stream');
    }
    
    if (tracks.length > 0) {
      return new MediaStream(tracks);
    }
    
    console.warn('⚠️ No local tracks available');
    return null;
  }

  toggleAudio(enabled) {
    const audioTrack = this.localTracks.find(t => t.kind === Track.Kind.Audio);
    if (audioTrack) {
      if (enabled) {
        audioTrack.unmute();
      } else {
        audioTrack.mute();
      }
      console.log('🎤 Audio', enabled ? 'enabled' : 'muted');
      return true;
    }
    console.warn('⚠️ No audio track found');
    return false;
  }

  toggleVideo(enabled) {
    const videoTrack = this.localTracks.find(t => t.kind === Track.Kind.Video);
    if (videoTrack) {
      if (enabled) {
        videoTrack.unmute();
      } else {
        videoTrack.mute();
      }
      console.log('📹 Video', enabled ? 'enabled' : 'muted');
      return true;
    }
    console.warn('⚠️ No video track found');
    return false;
  }

  async endCall() {
    console.log('📞 Ending LiveKit call');
    this.cleanup();
  }

  cleanup() {
    console.log('🧹 Cleaning up LiveKit call');

    this.localTracks.forEach(track => {
      track.stop();
    });
    this.localTracks = [];

    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }

    console.log('✅ Cleanup complete');
  }
}

export default new LiveKitCallClient();