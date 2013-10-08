#!/bin/bash
set -e

grunt build compress
tar -xvzf tmp/kibana-latest.tar.gz -C /var/www/
sed -i 's/elasticsearch:.*/elasticsearch: "http:\/\/parrot-log.rogach.org",/' /var/www/kibana-latest/config.js
