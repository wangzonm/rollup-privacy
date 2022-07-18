#!/bin/bash
source ./config.properties
docker cp ${fileName} operator:${filePath}/${fileName}
docker restart operator
