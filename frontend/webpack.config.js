const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { InjectManifest } = require('workbox-webpack-plugin');

module.exports = {
  entry: './src/app.js',
  output: {
    path: path.resolve(__dirname, 'dist')+'/',
    filename: 'bundle.[contenthash].js',
    clean: true,
  },
  mode: process.env.NODE_ENV || 'production',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      inject: 'body',
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public/styles.css', to: 'styles.css' },
        { from: 'public/manifest.json', to: 'manifest.json', noErrorOnMissing: true },
        { from: 'public/icon-192.png', to: 'icon-192.png', noErrorOnMissing: true },
        { from: 'public/icon-512.png', to: 'icon-512.png', noErrorOnMissing: true },
      ],
    }),
    new InjectManifest({
      swSrc: './src/service-worker.js',
      swDest: 'service-worker.js',
    }),
  ],
  optimization: {
    splitChunks: {
      chunks: 'all',
    },
  },
};
