import * as mediasoupClient from 'mediasoup-client';
import API from '../../api.js';

class ConferenceClient {
  constructor() {
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.producers = new Map(); // kind -> producer
    this.consumers = new Map(); // consumerId -> consumer
    this.localStream = null;
    this.callId = null;
    this.onRemoteStream = null;
  }

  async joinConference(callId, isVideo = true) {
    this.callId = callId;

    console.log('🎥 Joining conference:', callId);

    try {
      // Получить RTP capabilities
      const { rtpCapabilities } = await API.getRouterCapabilities(callId);

      // Создать device
      this.device = new mediasoupClient.Device();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });

      console.log('✅ Device loaded');

      // Получить локальный стрим
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: isVideo ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        } : false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log('✅ Local stream acquired');

      // Создать transports
      await this.createSendTransport();
      await this.createRecvTransport();

      // Начать produce
      await this.produce();

      return this.localStream;
    } catch (error) {
      console.error('❌ Failed to join conference:', error);
      throw error;
    }
  }

  async createSendTransport() {
    const transportInfo = await API.createTransport(this.callId, { producing: true });

    this.sendTransport = this.device.createSendTransport(transportInfo);

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await API.connectTransport(transportInfo.id, dtlsParameters);
        callback();
      } catch (error) {
        errback(error);
      }
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const { id } = await API.produce(transportInfo.id, kind, rtpParameters);
        callback({ id });
      } catch (error) {
        errback(error);
      }
    });

    console.log('✅ Send transport created');
  }

  async createRecvTransport() {
    const transportInfo = await API.createTransport(this.callId, { consuming: true });

    this.recvTransport = this.device.createRecvTransport(transportInfo);

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await API.connectTransport(transportInfo.id, dtlsParameters);
        callback();
      } catch (error) {
        errback(error);
      }
    });

    console.log('✅ Recv transport created');
  }

  async produce() {
    // Produce audio
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      const audioProducer = await this.sendTransport.produce({ track: audioTrack });
      this.producers.set('audio', audioProducer);
      console.log('✅ Audio producer created');
    }

    // Produce video
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      const videoProducer = await this.sendTransport.produce({ track: videoTrack });
      this.producers.set('video', videoProducer);
      console.log('✅ Video producer created');
    }
  }

  async consume(producerId) {
    const consumerInfo = await API.consume(
      this.recvTransport.id,
      producerId,
      this.device.rtpCapabilities
    );

    const consumer = await this.recvTransport.consume(consumerInfo);

    this.consumers.set(consumer.id, consumer);

    await API.resumeConsumer(consumer.id);

    console.log('✅ Consumer created:', consumer.id);

    // Создать MediaStream из consumer
    const stream = new MediaStream([consumer.track]);

    if (this.onRemoteStream) {
      this.onRemoteStream(stream, consumer.id);
    }

    return consumer;
  }

  toggleAudio(enabled) {
    const producer = this.producers.get('audio');
    if (producer) {
      if (enabled) {
        producer.resume();
      } else {
        producer.pause();
      }
    }
  }

  toggleVideo(enabled) {
    const producer = this.producers.get('video');
    if (producer) {
      if (enabled) {
        producer.resume();
      } else {
        producer.pause();
      }
    }
  }

  async leaveConference() {
    console.log('📞 Leaving conference');

    // Close producers
    this.producers.forEach(producer => producer.close());
    this.producers.clear();

    // Close consumers
    this.consumers.forEach(consumer => consumer.close());
    this.consumers.clear();

    // Close transports
    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Cleanup на сервере
    await API.cleanupCall(this.callId);

    this.callId = null;
  }
}

export default new ConferenceClient();
