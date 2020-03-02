FROM atlassianlabs/docker-node-jdk-chrome-firefox
RUN npm install -g npm
WORKDIR /src
ADD ./package.json /src/package.json
ADD ./package-lock.json /src/package-lock.json
RUN npm install
CMD ["npm", "test"]
