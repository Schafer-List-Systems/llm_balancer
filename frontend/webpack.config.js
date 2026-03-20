// Load .env file for configuration
try {
  require('dotenv').config();
} catch (e) {}

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const apiBaseUrl = process.env.API_BASE_URL || process.env.WEBPACK_API_BASE_URL || 'http://localhost:3001';
const refreshInterval = parseInt(process.env.REFRESH_INTERVAL) || parseInt(process.env.WEBPACK_REFRESH_INTERVAL) || 5000;

module.exports = {
  entry: {
    app: './public/js/dashboard.js',
    api: './public/js/api.js'
  },
  output: {
    path: path.resolve(__dirname, 'public', 'js', 'dist'),
    filename: '[name].bundle.js?v=[contenthash]',
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: './index.html',
      inject: false
    }),
    new webpack.DefinePlugin({
      'process.env.API_BASE_URL': JSON.stringify(apiBaseUrl),
      'process.env.REFRESH_INTERVAL': JSON.stringify(refreshInterval)
    })
  ],
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  require('autoprefixer'),
                  require('postcss-preset-env')({ stage: 3 })
                ]
              }
            }
          }
        ]
      }
    ]
  },
  devtool: 'eval-source-map'
};