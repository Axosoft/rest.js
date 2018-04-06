'use strict'

module.exports = request

const fetch = require('node-fetch')
const debug = require('debug')('octokit:rest')
const defaults = require('lodash/defaults')
const forEach = require('lodash/forEach')
const isPlainObject = require('lodash/isPlainObject')
const pick = require('lodash/pick')

const getBuffer = require('./get-buffer-response')
const HttpError = require('./http-error')

function request (requestOptions) {
  debug('REQUEST:', requestOptions)

  // calculate content length unless body is a stream, in which case the
  // content length is already set per option
  if (requestOptions.body) {
    defaults(requestOptions.headers, {
      'content-type': 'application/json; charset=utf-8'
    })
  }

  // https://fetch.spec.whatwg.org/#methods
  requestOptions.method = requestOptions.method.toUpperCase()

  // GitHub expects "content-length: 0" header for PUT/PATCH requests without body
  // fetch does not allow to set `content-length` header, but we can set body to an empty string
  if (['PATCH', 'PUT'].indexOf(requestOptions.method) >= 0 && !requestOptions.body) {
    requestOptions.body = ''
  }

  if (isPlainObject(requestOptions.body) || Array.isArray(requestOptions.body)) {
    requestOptions.body = JSON.stringify(requestOptions.body)
  }

  if (requestOptions.xhr) {
    delete requestOptions['user-agent'];

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      if (requestOptions.timeout) {
        xhr.timeout = requestOptions.timeout
      }

      xhr.open(requestOptions.method, requestOptions.url)

      forEach(requestOptions.headers, function(headerValue, headerName) {
        xhr.setRequestHeader(headerName, headerValue)
      })

      xhr.onreadystatechange = function onreadystatechange() {
        if (xhr.readyState !== 4) {
          return
        }

        function parseXhrHeaders(headerStrings) {
          const xhrHeaders = {}
          const regexp = /^([^:]+): (.*)/

          for (const headerString of headerStrings) {
            const match = headerString.match(regexp)
            if (match) {
              xhrHeaders[match[1].toLowerCase()] = match[2]
            }
          }

          return xhrHeaders
        }

        let responseHeaders = xhr.getAllResponseHeaders()
        if (headers !== null) {
          responseHeaders = parseHeaders(responseHeaders.split('\n'))
        }

        if (xhr.status >= 300 && xhr.status <= 399 && 'location' in responseHeaders) {
          const redirectUrl = Url.resolve(url, responseHeaders.location)
          url = redirectUrl
        }

        let responseBody = null
        if (xhr.response) {
          responseBody = xhr.response
        } else if (xhr.responseType === 'text' || !xhr.responseType) {
          responseBody = xhr.responseText || xhr.responseXML
        }

        const response = {
          data: responseBody,
          headers: responseHeaders,
          method,
          statusCode: xhr.status,
          url,
          xhr
        }
        if (xhr.status >= 400 && xhr.status < 600 || xhr.status < 10) {
          reject(new error.HttpError(responseBody, xhr.status, responseHeaders))
        } else {
          resolve(response)
        }
      }

      xhr.onerror = function onerror(err) {
        reject(err)
      }

      xhr.ontimeout = function ontimeout() {
        reject(new error.GatewayTimeout())
      }

      // write data to request body
      if (hasBody && query.length) {
        xhr.send(query)
      } else if (block.hasFileBody) {
        const fileData = fs.readFileSync(msg.filePath)
        xhr.send(fileData)
      } else {
        xhr.send()
      }
    })
  }

  let headers = {}
  return fetch(requestOptions.url, pick(requestOptions, 'method', 'body', 'headers', 'timeout', 'agent'))

    .then(response => {
      const contentType = response.headers.get('content-type')

      for (const keyAndValue of response.headers.entries()) {
        headers[keyAndValue[0]] = keyAndValue[1]
      }

      if (response.status === 204) {
        return
      }

      if (response.status === 304) {
        requestOptions.url = response.headers.location
        throw new HttpError('Not modified', response.status, headers)
      }

      if (response.status >= 400) {
        return response.text()

          .then(message => {
            throw new HttpError(message, response.status, headers)
          })
      }

      if (/application\/json/.test(contentType)) {
        return response.json()
      }

      if (!contentType || /^text\/|charset=utf-8$/.test(contentType)) {
        return response.text()
      }

      return getBuffer(response)
    })

    .then(data => {
      return {
        data,
        meta: headers
      }
    })

    .catch(error => {
      if (error instanceof HttpError) {
        throw error
      }

      throw new HttpError(error.message, 500, headers)
    })
}
