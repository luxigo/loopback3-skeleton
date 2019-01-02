#!/bin/bash
cd $(dirname $0)

CMD=$(cat << EOF
  require('./server/server.js');
  loopback=require('loopback');
  app=loopback.getModel('user').app;
  app.start(app.get('enableSSL'));
EOF
)

[ -z "$PORT" ] && export PORT=3003
node -i -e "$CMD"
