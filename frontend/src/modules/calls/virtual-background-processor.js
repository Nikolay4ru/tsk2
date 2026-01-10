// frontend/src/modules/calls/virtual-background-processor.js
// ✅ BODYPIX WITH INVERTED MASK
// ✅ If BodyPix returns: person=0, background=1

import * as bodyPix from '@tensorflow-models/body-pix';

class VirtualBackgroundProcessor {
  constructor() {
    this.net = null;
    this.canvas = null;
    this.ctx = null;
    this.videoElement = null;
    this.outputStream = null;
    this.animationFrameId = null;
    this.isProcessing = false;
    
    // Background settings
    this.backgroundMode = 'none';
    this.backgroundImage = null;
    this.blurAmount = 10;
    this.edgeBlurAmount = 4;
    
    // Performance
    this.fps = 30;
    this.frameInterval = 1000 / this.fps;
    this.lastFrameTime = 0;
    
    // Segmentation
    this.segmentationWidth = 480;
    this.segmentationHeight = 320;
    this.segmentationPixelCount = this.segmentationWidth * this.segmentationHeight;
    
    this.segmentationCanvas = null;
    this.segmentationCtx = null;
    this.maskCanvas = null;
    this.maskCtx = null;
    this.maskImageData = null;
  }

  async initialize() {
    console.log('🎨 Initializing BodyPix (INVERTED MASK version)...');
    
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 640;
      this.canvas.height = 480;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      
      this.segmentationCanvas = document.createElement('canvas');
      this.segmentationCanvas.width = this.segmentationWidth;
      this.segmentationCanvas.height = this.segmentationHeight;
      this.segmentationCtx = this.segmentationCanvas.getContext('2d');
      
      this.maskCanvas = document.createElement('canvas');
      this.maskCanvas.width = this.segmentationWidth;
      this.maskCanvas.height = this.segmentationHeight;
      this.maskCtx = this.maskCanvas.getContext('2d');
      
      this.maskImageData = new ImageData(this.segmentationWidth, this.segmentationHeight);
      
      console.log('📦 Loading BodyPix model...');
      this.net = await bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2
      });
      console.log('✅ BodyPix model loaded');
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to initialize BodyPix:', error);
      return false;
    }
  }

  async startProcessing(inputStream) {
    if (this.isProcessing) {
      console.warn('⚠️ Already processing');
      return this.outputStream;
    }
    
    console.log('🎬 Starting BodyPix processing');
    
    try {
      const videoTrack = inputStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track found');
      }
      
      const settings = videoTrack.getSettings();
      this.canvas.width = settings.width || 640;
      this.canvas.height = settings.height || 480;
      
      console.log('📐 Canvas size:', this.canvas.width, 'x', this.canvas.height);
      
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = inputStream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
      
      await new Promise((resolve, reject) => {
        this.videoElement.onloadedmetadata = resolve;
        this.videoElement.onerror = reject;
        setTimeout(() => reject(new Error('Video load timeout')), 5000);
      });
      
      await this.videoElement.play();
      console.log('✅ Video ready:', this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);
      
      const canvasStream = this.canvas.captureStream(this.fps);
      const audioTracks = inputStream.getAudioTracks();
      
      this.outputStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks
      ]);
      
      this.isProcessing = true;
      this.processLoop();
      
      console.log('✅ BodyPix processing started');
      return this.outputStream;
      
    } catch (error) {
      console.error('❌ Failed to start processing:', error);
      throw error;
    }
  }

  processLoop() {
    if (!this.isProcessing) return;
    
    const now = performance.now();
    const elapsed = now - this.lastFrameTime;
    
    if (elapsed >= this.frameInterval) {
      this.lastFrameTime = now;
      
      if (this.videoElement && this.videoElement.readyState === 4) {
        this.processFrame();
      }
    }
    
    this.animationFrameId = requestAnimationFrame(() => this.processLoop());
  }

  processFrame() {
    const { width, height } = this.canvas;
    
    if (width === 0 || height === 0 || !this.ctx || !this.videoElement) {
      return;
    }
    
    if (this.backgroundMode === 'none') {
      this.ctx.save();
      this.ctx.clearRect(0, 0, width, height);
      this.ctx.drawImage(this.videoElement, 0, 0, width, height);
      this.ctx.restore();
      return;
    }
    
    // Draw video to segmentation canvas
    this.segmentationCtx.drawImage(
      this.videoElement,
      0, 0,
      this.segmentationWidth,
      this.segmentationHeight
    );
    
    // Run segmentation
    this.net.segmentPerson(this.segmentationCanvas, {
      flipHorizontal: false,
      internalResolution: 'medium',
      segmentationThreshold: 0.7
    }).then(segmentation => {
      // ✅ INVERTED MASK: person=0, background=1
      // We want: person=255 (opaque), background=0 (transparent)
      // So INVERT: alpha = segmentation.data[i] ? 0 : 255
      
      for (let i = 0; i < this.segmentationPixelCount; i++) {
        this.maskImageData.data[i * 4 + 0] = 255;  // R
        this.maskImageData.data[i * 4 + 1] = 255;  // G
        this.maskImageData.data[i * 4 + 2] = 255;  // B
        // ✅ INVERT: if segmentation=1 (background) → alpha=0, if segmentation=0 (person) → alpha=255
        this.maskImageData.data[i * 4 + 3] = segmentation.data[i] ? 0 : 255;
      }
      
      this.maskCtx.putImageData(this.maskImageData, 0, 0);
      this.renderWithMask();
      
    }).catch(error => {
      console.error('Segmentation error:', error);
      this.ctx.save();
      this.ctx.clearRect(0, 0, width, height);
      this.ctx.drawImage(this.videoElement, 0, 0, width, height);
      this.ctx.restore();
    });
  }

  renderWithMask() {
    const { width, height } = this.canvas;
    
    if (!this.ctx || !this.videoElement || !this.maskCanvas) {
      return;
    }
    
    try {
      this.ctx.save();
      this.ctx.clearRect(0, 0, width, height);
      
      // CODESANDBOX ALGORITHM
      this.ctx.globalCompositeOperation = 'copy';
      this.ctx.filter = 'none';
      
      // Draw mask with edge blur
      this.ctx.filter = `blur(${this.edgeBlurAmount}px)`;
      this.ctx.drawImage(this.maskCanvas, 0, 0, width, height);
      
      // Keep only person
      this.ctx.globalCompositeOperation = 'source-in';
      this.ctx.filter = 'none';
      this.ctx.drawImage(this.videoElement, 0, 0, width, height);
      
      // Draw background under
      this.ctx.globalCompositeOperation = 'destination-over';
      
      if (this.backgroundMode === 'blur') {
        this.ctx.filter = `blur(${this.blurAmount}px)`;
        this.ctx.drawImage(this.videoElement, 0, 0, width, height);
        this.ctx.filter = 'none';
      } else if (this.backgroundMode === 'image' && this.backgroundImage) {
        this.ctx.filter = 'none';
        this.ctx.drawImage(this.backgroundImage, 0, 0, width, height);
      }
      
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.filter = 'none';
      this.ctx.restore();
      
    } catch (error) {
      console.error('❌ Render error:', error);
    }
  }

  setBackgroundMode(mode) {
    console.log('🎨 Setting background mode:', mode);
    this.backgroundMode = mode;
  }

  async setBackgroundImage(imageSource) {
    console.log('🖼️ Setting background image:', imageSource);
    
    if (typeof imageSource === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          this.backgroundImage = img;
          console.log('✅ Background image loaded:', img.width, 'x', img.height);
          resolve();
        };
        img.onerror = (error) => {
          console.error('❌ Failed to load background image:', error);
          reject(error);
        };
        img.src = imageSource;
      });
    } else {
      this.backgroundImage = imageSource;
    }
  }

  setBlurAmount(amount) {
    this.blurAmount = Math.max(1, Math.min(20, amount));
    console.log('🌫️ Blur amount:', this.blurAmount, 'px');
  }

  setEdgeBlurAmount(amount) {
    this.edgeBlurAmount = Math.max(1, Math.min(10, amount));
    console.log('✨ Edge blur:', this.edgeBlurAmount, 'px');
  }

  stopProcessing() {
    console.log('🛑 Stopping BodyPix processing');
    
    this.isProcessing = false;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    
    if (this.outputStream) {
      this.outputStream.getTracks().forEach(track => track.stop());
      this.outputStream = null;
    }
    
    console.log('✅ Processing stopped');
  }

  cleanup() {
    this.stopProcessing();
    
    if (this.net) {
      this.net.dispose();
      this.net = null;
    }
    
    this.canvas = null;
    this.ctx = null;
    this.segmentationCanvas = null;
    this.segmentationCtx = null;
    this.maskCanvas = null;
    this.maskCtx = null;
    this.maskImageData = null;
    this.backgroundImage = null;
    
    console.log('✅ BodyPix cleaned up');
  }
}

export default VirtualBackgroundProcessor;