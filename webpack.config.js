const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const path = require('path');
module.exports = {
    mode: 'development',
    entry: {
      medblocks: './src/medblocks.js',
    },
    plugins: [
      new CleanWebpackPlugin(),
    ],
    // devtool: 'inline-source-map',
    output: {
      filename: 'medblocks.js',
      path: path.resolve(__dirname, 'dist'),
      libraryTarget: 'umd',
      library: 'MedBlocks',
      libraryExport: "default"
    },
}
