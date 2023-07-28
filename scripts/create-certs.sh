#!/bin/bash
echo *********************************
echo *****Create certs directory******
echo *********************************
mkdir -p certs
cd certs


echo *********************************
echo *********Create Certs************
echo *********************************

../scripts/generate-ssl.sh localhost


