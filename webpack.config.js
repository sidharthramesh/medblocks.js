module.exports = {
    mode: 'development',
    entry: {
      medblocks: './medblocks.js',
    },
    devtool: 'inline-source-map',
   devServer: {
     contentBase: './dist',
     port: 9000
   },
}
