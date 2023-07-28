#!/bin/bash

# Bash shell script for generating self-signed certs. Run this in a folder, as it
# generates a few files.
#
# Reference: https://gist.github.com/bradland/1690807
# Date: 2012-01-27

# Script accepts a single argument, the fqdn for the cert
DOMAIN="$1"
if [ -z "$DOMAIN" ]; then
  echo "Usage: $(basename $0) <domain>"
  exit 11
fi

fail_if_error() {
  [ $1 != 0 ] && {
    exit 10
  }
}

# Certificate details; replace items in angle brackets with your own info
subj="
C=NZ
commonName=$DOMAIN
"

# Generate the CSR
openssl req \
    -new \
    -nodes \
    -subj "$(echo -n "$subj" | tr "\n" "/")" \
    -keyout $DOMAIN.key \
    -out $DOMAIN.csr \

fail_if_error $?

echo "Created $DOMAIN.key"
echo "Created $DOMAIN.csr"

# Generate the cert (good for 10 years)
openssl x509 -req -days 3650 -in $DOMAIN.csr -signkey $DOMAIN.key -out $DOMAIN.crt
echo "Created $DOMAIN.crt (self-signed)"
fail_if_error $?