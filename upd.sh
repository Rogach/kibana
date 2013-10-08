#!/bin/bash
set -e

grunt less build compress
sleep 0.5
tar -xvzf tmp/kibana-latest.tar.gz -C /var/www/
sed -i 's/elasticsearch:.*/elasticsearch: "http:\/\/parrot-log.rogach.org:9201",/' /var/www/kibana-latest/config.js
