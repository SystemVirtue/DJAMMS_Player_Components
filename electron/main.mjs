'use strict';

var React = require('react');
var axios = require('axios');
var supabaseJs = require('@supabase/supabase-js');

// components/VideoElement.tsx
var VideoElement = /*#__PURE__*/React.forwardRef(function (_ref, ref) {
  var className = _ref.className,
    style = _ref.style;
  return /*#__PURE__*/React.createElement("video", {
    ref: ref,
    className: className,
    style: style,
    preload: "auto",
    playsInline: true,
    muted: false
  });
});
VideoElement.displayName = 'VideoElement';

// utils/playlistHelpers.ts
/**
 * Get display name for a playlist folder, stripping YouTube Playlist ID prefix if present.
 *
 * Naming convention:
 * - YouTube sourced: "{PlaylistID}.{PlaylistName}" e.g., "PLJ7vMjpVbhBWLWJpweVDki43Wlcqzsqdu.DJAMMS_Default"
 * - Non-YouTube: "{PlaylistName}" e.g., "Karaoke Collection"
 *
 * @param folderName - The original playlist folder name
 * @returns The display name without YouTube Playlist ID prefix
 */
function getPlaylistDisplayName(folderName) {
  if (!folderName) return '';
  // Check if folder name starts with YouTube playlist ID pattern
  // YouTube playlist IDs typically start with "PL" and are 34 characters
  // Pattern: PLxxxxxx followed by dot or underscore, then the display name
  // Examples:
  //   "PLN9QqCogPsXIoSObV0F39OZ_MlRZ9tRT9.Obie Nights" -> "Obie Nights"
  //   "PLJ7vMjpVbhBWLWJpweVDki43Wlcqzsqdu_DJAMMS_Default" -> "DJAMMS_Default"
  var youtubeIdMatch = folderName.match(/^PL[A-Za-z0-9_-]+[._](.+)$/);
  if (youtubeIdMatch) {
    return youtubeIdMatch[1];
  }
  return folderName;
}
/**
 * Get the display artist string, returning empty string if artist is null/undefined
 *
 * @param artist - The artist name or null
 * @returns The artist name or empty string
 */
function getDisplayArtist(artist) {
  return artist || '';
}
/**
 * Clean a video title by removing YouTube IDs and separators.
 *
 * BULLETPROOF DETECTION LOGIC:
 * YouTube video IDs are exactly 11 characters. Our filename format is:
 * "[11-char YouTube_ID] [separator] [Artist] - [Title].mp4"
 *
 * This means:
 * - Characters 0-10: YouTube ID (11 chars)
 * - Character 11: space
 * - Character 12: separator (could be |, ·, •, or ANY corrupted/unknown character)
 * - Character 13: space
 * - Characters 14+: The actual "Artist - Title" content
 *
 * Detection: If character at position 11 is a space AND character at position 13 is a space,
 * then we have a YouTube ID prefix. Strip the first 14 characters.
 *
 * This handles ALL separator corruption scenarios including:
 * - Normal: | (pipe)
 * - Windows substitution: · (middle dot U+00B7)
 * - Windows substitution: • (bullet U+2022)
 * - Replacement character: � (U+FFFD)
 * - Any other corrupted/unknown character
 *
 * @param title - The raw title string (may contain YouTube ID and separator)
 * @returns The cleaned title suitable for display
 */
function cleanVideoTitle(title) {
  if (!title) return 'Unknown';
  // BULLETPROOF: Check if string follows YouTube ID pattern:
  // Position 11 = space, Position 13 = space (meaning there's a separator at position 12)
  // Format: "xxxxxxxxxxx ? " where x = YT ID chars, ? = any separator
  if (title.length >= 14 && title.charAt(11) === ' ' && title.charAt(13) === ' ') {
    // Strip the first 14 characters: "[11-char ID] [sep] "
    title = title.substring(14);
  }
  // Fallback: Also try to match known separators with surrounding spaces anywhere in string
  // This catches edge cases where the ID might be slightly different length
  if (!title || title === 'Unknown') {
    return 'Unknown';
  }
  // Also remove any remaining bracketed IDs in the middle/end (e.g., "[dQw4w9WgXcQ]")
  title = title.replace(/\s*\[[A-Za-z0-9_-]{10,15}\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return title || 'Unknown';
}

// components/NowPlayingOverlay.tsx
var NowPlayingOverlay = function NowPlayingOverlay(_ref) {
  var video = _ref.video,
    currentTime = _ref.currentTime,
    duration = _ref.duration,
    visible = _ref.visible,
    _ref$className = _ref.className,
    className = _ref$className === void 0 ? '' : _ref$className;
  if (!visible || !video) return null;
  var progress = duration > 0 ? currentTime / duration * 100 : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "now-playing-overlay ".concat(className),
    style: {
      position: 'absolute',
      top: '20px',
      right: '20px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      maxWidth: '300px',
      zIndex: 1000,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(100%)',
      transition: 'opacity 0.3s ease, transform 0.3s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "now-playing-title",
    style: {
      fontSize: '18px',
      fontWeight: 'bold',
      marginBottom: '5px'
    }
  }, cleanVideoTitle(video.title)), video.artist && video.artist !== 'Unknown Artist' && (/*#__PURE__*/React.createElement("div", {
    className: "now-playing-artist",
    style: {
      fontSize: '14px',
      color: '#ccc',
      marginBottom: '10px'
    }
  }, video.artist)), /*#__PURE__*/React.createElement("div", {
    className: "progress-container",
    style: {
      width: '100%',
      height: '4px',
      background: 'rgba(255, 255, 255, 0.3)',
      borderRadius: '2px',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "progress-fill",
    style: {
      width: "".concat(progress, "%"),
      height: '100%',
      background: '#007bff',
      transition: 'width 0.1s ease'
    }
  })));
};

// components/LoadingScreen.tsx
var LoadingScreen = function LoadingScreen(_ref) {
  var visible = _ref.visible,
    _ref$message = _ref.message,
    message = _ref$message === void 0 ? 'Loading...' : _ref$message,
    _ref$className = _ref.className,
    className = _ref$className === void 0 ? '' : _ref$className;
  if (!visible) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "loading-screen ".concat(className),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.5s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      color: 'white'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "spinner",
    style: {
      width: '40px',
      height: '40px',
      border: '4px solid rgba(255, 255, 255, 0.3)',
      borderTop: '4px solid white',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      margin: '0 auto 20px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '18px'
    }
  }, message)), /*#__PURE__*/React.createElement("style", null, "\n        @keyframes spin {\n          0% { transform: rotate(0deg); }\n          100% { transform: rotate(360deg); }\n        }\n      "));
};

// components/ErrorOverlay.tsx
var ErrorOverlay = function ErrorOverlay(_ref) {
  var visible = _ref.visible,
    error = _ref.error,
    onRetry = _ref.onRetry,
    _ref$className = _ref.className,
    className = _ref$className === void 0 ? '' : _ref$className;
  if (!visible || !error) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "error-overlay ".concat(className),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.5s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      color: 'white',
      maxWidth: '400px',
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '48px',
      marginBottom: '20px',
      color: '#ff6b6b'
    }
  }, "\u26A0\uFE0F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '18px',
      marginBottom: '20px',
      fontWeight: 'bold'
    }
  }, "Playback Error"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      marginBottom: '30px',
      lineHeight: '1.5'
    }
  }, error), onRetry && (/*#__PURE__*/React.createElement("button", {
    onClick: onRetry,
    style: {
      padding: '10px 20px',
      background: '#007bff',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '16px'
    }
  }, "Try Again"))));
};

// components/ProgressBar.tsx
var ProgressBar = function ProgressBar(_ref) {
  var currentTime = _ref.currentTime,
    duration = _ref.duration,
    onSeek = _ref.onSeek,
    _ref$className = _ref.className,
    className = _ref$className === void 0 ? '' : _ref$className;
  var progressRef = React.useRef(null);
  var formatTime = function formatTime(time) {
    var minutes = Math.floor(time / 60);
    var seconds = Math.floor(time % 60);
    return "".concat(minutes, ":").concat(seconds.toString().padStart(2, '0'));
  };
  var handleClick = function handleClick(event) {
    if (!onSeek || !progressRef.current) return;
    var rect = progressRef.current.getBoundingClientRect();
    var clickX = event.clientX - rect.left;
    var percentage = clickX / rect.width;
    var newTime = percentage * duration;
    onSeek(Math.max(0, Math.min(newTime, duration)));
  };
  var progress = duration > 0 ? currentTime / duration * 100 : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "progress-bar ".concat(className),
    style: {
      width: '100%',
      height: '20px',
      background: 'rgba(255, 255, 255, 0.2)',
      borderRadius: '10px',
      cursor: onSeek ? 'pointer' : 'default',
      position: 'relative',
      overflow: 'hidden'
    },
    onClick: handleClick,
    ref: progressRef
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: "".concat(progress, "%"),
      background: '#007bff',
      borderRadius: '10px',
      transition: 'width 0.1s ease'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      color: 'white',
      fontSize: '12px',
      fontWeight: 'bold',
      textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)',
      pointerEvents: 'none'
    }
  }, formatTime(currentTime), " / ", formatTime(duration)));
};

function _arrayLikeToArray(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}
function _arrayWithHoles(r) {
  if (Array.isArray(r)) return r;
}
function _arrayWithoutHoles(r) {
  if (Array.isArray(r)) return _arrayLikeToArray(r);
}
function asyncGeneratorStep(n, t, e, r, o, a, c) {
  try {
    var i = n[a](c),
      u = i.value;
  } catch (n) {
    return void e(n);
  }
  i.done ? t(u) : Promise.resolve(u).then(r, o);
}
function _asyncToGenerator(n) {
  return function () {
    var t = this,
      e = arguments;
    return new Promise(function (r, o) {
      var a = n.apply(t, e);
      function _next(n) {
        asyncGeneratorStep(a, r, o, _next, _throw, "next", n);
      }
      function _throw(n) {
        asyncGeneratorStep(a, r, o, _next, _throw, "throw", n);
      }
      _next(void 0);
    });
  };
}
function _classCallCheck(a, n) {
  if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function");
}
function _defineProperties(e, r) {
  for (var t = 0; t < r.length; t++) {
    var o = r[t];
    o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o);
  }
}
function _createClass(e, r, t) {
  return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", {
    writable: !1
  }), e;
}
function _createForOfIteratorHelper(r, e) {
  var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (!t) {
    if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) {
      t && (r = t);
      var n = 0,
        F = function () {};
      return {
        s: F,
        n: function () {
          return n >= r.length ? {
            done: !0
          } : {
            done: !1,
            value: r[n++]
          };
        },
        e: function (r) {
          throw r;
        },
        f: F
      };
    }
    throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }
  var o,
    a = !0,
    u = !1;
  return {
    s: function () {
      t = t.call(r);
    },
    n: function () {
      var r = t.next();
      return a = r.done, r;
    },
    e: function (r) {
      u = !0, o = r;
    },
    f: function () {
      try {
        a || null == t.return || t.return();
      } finally {
        if (u) throw o;
      }
    }
  };
}
function _defineProperty(e, r, t) {
  return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : e[r] = t, e;
}
function _iterableToArray(r) {
  if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r);
}
function _iterableToArrayLimit(r, l) {
  var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (null != t) {
    var e,
      n,
      i,
      u,
      a = [],
      f = !0,
      o = !1;
    try {
      if (i = (t = t.call(r)).next, 0 === l) {
        if (Object(t) !== t) return;
        f = !1;
      } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
    } catch (r) {
      o = !0, n = r;
    } finally {
      try {
        if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
      } finally {
        if (o) throw n;
      }
    }
    return a;
  }
}
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _nonIterableSpread() {
  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function (r) {
      return Object.getOwnPropertyDescriptor(e, r).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), !0).forEach(function (r) {
      _defineProperty(e, r, t[r]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) {
      Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
    });
  }
  return e;
}
function _regenerator() {
  /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */
  var e,
    t,
    r = "function" == typeof Symbol ? Symbol : {},
    n = r.iterator || "@@iterator",
    o = r.toStringTag || "@@toStringTag";
  function i(r, n, o, i) {
    var c = n && n.prototype instanceof Generator ? n : Generator,
      u = Object.create(c.prototype);
    return _regeneratorDefine(u, "_invoke", function (r, n, o) {
      var i,
        c,
        u,
        f = 0,
        p = o || [],
        y = !1,
        G = {
          p: 0,
          n: 0,
          v: e,
          a: d,
          f: d.bind(e, 4),
          d: function (t, r) {
            return i = t, c = 0, u = e, G.n = r, a;
          }
        };
      function d(r, n) {
        for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) {
          var o,
            i = p[t],
            d = G.p,
            l = i[2];
          r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0));
        }
        if (o || r > 1) return a;
        throw y = !0, n;
      }
      return function (o, p, l) {
        if (f > 1) throw TypeError("Generator is already running");
        for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) {
          i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u);
          try {
            if (f = 2, i) {
              if (c || (o = "next"), t = i[o]) {
                if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object");
                if (!t.done) return t;
                u = t.value, c < 2 && (c = 0);
              } else 1 === c && (t = i.return) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1);
              i = e;
            } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break;
          } catch (t) {
            i = e, c = 1, u = t;
          } finally {
            f = 1;
          }
        }
        return {
          value: t,
          done: y
        };
      };
    }(r, o, i), !0), u;
  }
  var a = {};
  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}
  t = Object.getPrototypeOf;
  var c = [][n] ? t(t([][n]())) : (_regeneratorDefine(t = {}, n, function () {
      return this;
    }), t),
    u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c);
  function f(e) {
    return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e;
  }
  return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine(u), _regeneratorDefine(u, o, "Generator"), _regeneratorDefine(u, n, function () {
    return this;
  }), _regeneratorDefine(u, "toString", function () {
    return "[object Generator]";
  }), (_regenerator = function () {
    return {
      w: i,
      m: f
    };
  })();
}
function _regeneratorDefine(e, r, n, t) {
  var i = Object.defineProperty;
  try {
    i({}, "", {});
  } catch (e) {
    i = 0;
  }
  _regeneratorDefine = function (e, r, n, t) {
    function o(r, n) {
      _regeneratorDefine(e, r, function (e) {
        return this._invoke(r, n, e);
      });
    }
    r ? i ? i(e, r, {
      value: n,
      enumerable: !t,
      configurable: !t,
      writable: !t
    }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2));
  }, _regeneratorDefine(e, r, n, t);
}
function _slicedToArray(r, e) {
  return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
}
function _toConsumableArray(r) {
  return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread();
}
function _toPrimitive(t, r) {
  if ("object" != typeof t || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != typeof i) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function _toPropertyKey(t) {
  var i = _toPrimitive(t, "string");
  return "symbol" == typeof i ? i : i + "";
}
function _unsupportedIterableToArray(r, a) {
  if (r) {
    if ("string" == typeof r) return _arrayLikeToArray(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
  }
}

var ElectronIPCAdapter = /*#__PURE__*/function () {
  function ElectronIPCAdapter() {
    _classCallCheck(this, ElectronIPCAdapter);
  }
  return _createClass(ElectronIPCAdapter, [{
    key: "send",
    value: function send(channel, data) {
      if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send(channel, data);
      }
    }
  }, {
    key: "on",
    value: function on(channel, callback) {
      if (window.electronAPI && window.electronAPI.on) {
        window.electronAPI.on(channel, callback);
      }
    }
  }, {
    key: "off",
    value: function off(channel, callback) {
      if (window.electronAPI && window.electronAPI.off) {
        window.electronAPI.off(channel, callback);
      }
    }
  }]);
}();
var WebIPCAdapter = /*#__PURE__*/function () {
  function WebIPCAdapter() {
    _classCallCheck(this, WebIPCAdapter);
    this.listeners = new Map();
  }
  return _createClass(WebIPCAdapter, [{
    key: "send",
    value: function send(channel, data) {
      // No-op for web environment, or emit custom events
      console.log('[WebIPC]', channel, data);
      // Could dispatch custom events for web integration
      window.dispatchEvent(new CustomEvent("djamms:".concat(channel), {
        detail: data
      }));
    }
  }, {
    key: "on",
    value: function on(channel, callback) {
      if (!this.listeners.has(channel)) {
        this.listeners.set(channel, []);
      }
      this.listeners.get(channel).push(callback);
      // Listen for custom events in web environment
      var eventHandler = function eventHandler(event) {
        callback(event.detail);
      };
      window.addEventListener("djamms:".concat(channel), eventHandler);
    }
  }, {
    key: "off",
    value: function off(channel, callback) {
      var channelListeners = this.listeners.get(channel);
      if (channelListeners) {
        var index = channelListeners.indexOf(callback);
        if (index > -1) {
          channelListeners.splice(index, 1);
        }
      }
    }
  }]);
}();
var NoOpIPCAdapter = /*#__PURE__*/function () {
  function NoOpIPCAdapter() {
    _classCallCheck(this, NoOpIPCAdapter);
  }
  return _createClass(NoOpIPCAdapter, [{
    key: "send",
    value: function send(channel, data) {
      // No-op
    }
  }, {
    key: "on",
    value: function on(channel, callback) {
      // No-op
    }
  }, {
    key: "off",
    value: function off(channel, callback) {
      // No-op
    }
  }]);
}();
function createIPCAdapter() {
  var enableIPC = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
  if (enableIPC && window.electronAPI) {
    return new ElectronIPCAdapter();
  } else if (enableIPC) {
    return new WebIPCAdapter();
  } else {
    return new NoOpIPCAdapter();
  }
}

function useVideoPlayer(config) {
  var videoRefs = config.videoRefs,
    _config$initialVolume = config.initialVolume,
    initialVolume = _config$initialVolume === void 0 ? 0.7 : _config$initialVolume,
    onVideoEnd = config.onVideoEnd,
    onError = config.onError,
    _config$enableAudioNo = config.enableAudioNormalization,
    enableAudioNormalization = _config$enableAudioNo === void 0 ? false : _config$enableAudioNo;
  var _config$fadeDuration = config.fadeDuration,
    fadeDuration = _config$fadeDuration === void 0 ? 0.5 : _config$fadeDuration; // Only for skip fade
  var videoARef = videoRefs[0] || React.useRef(null);
  var videoBRef = videoRefs[1] || React.useRef(null);
  // Use refs instead of state for active/inactive tracking to avoid async state update issues
  var activeVideoRefRef = React.useRef(videoARef);
  var inactiveVideoRefRef = React.useRef(videoBRef);
  var activeVideoRef = activeVideoRefRef.current;
  var inactiveVideoRef = inactiveVideoRefRef.current;
  // State to trigger re-renders when active video changes
  var _useState = React.useState(0),
    _useState2 = _slicedToArray(_useState, 2);
    _useState2[1];
  // Player state
  var _useState3 = React.useState(null),
    _useState4 = _slicedToArray(_useState3, 2),
    currentVideo = _useState4[0],
    setCurrentVideo = _useState4[1];
  var _useState5 = React.useState(false),
    _useState6 = _slicedToArray(_useState5, 2),
    isPlaying = _useState6[0],
    setIsPlaying = _useState6[1];
  var _useState7 = React.useState(false),
    _useState8 = _slicedToArray(_useState7, 2),
    isLoading = _useState8[0],
    setIsLoading = _useState8[1];
  var _useState9 = React.useState(null),
    _useState0 = _slicedToArray(_useState9, 2),
    error = _useState0[0],
    setError = _useState0[1];
  var _useState1 = React.useState(0),
    _useState10 = _slicedToArray(_useState1, 2),
    currentTime = _useState10[0],
    setCurrentTime = _useState10[1];
  var _useState11 = React.useState(0),
    _useState12 = _slicedToArray(_useState11, 2),
    duration = _useState12[0],
    setDuration = _useState12[1];
  var _useState13 = React.useState(initialVolume),
    _useState14 = _slicedToArray(_useState13, 2),
    volume = _useState14[0],
    setVolumeState = _useState14[1];
  var _useState15 = React.useState(false),
    _useState16 = _slicedToArray(_useState15, 2),
    isMuted = _useState16[0],
    setIsMuted = _useState16[1];
  // IPC adapter
  var ipcAdapter = createIPCAdapter(true);
  // Retry tracking
  var retryCountRef = React.useRef(0);
  // Prevent rapid re-triggering of playVideo
  var isLoadingRef = React.useRef(false);
  var lastPlayRequestRef = React.useRef(null);
  // Track if we're in the middle of a user-initiated skip fade
  var isSkippingRef = React.useRef(false);
  React.useRef(null);
  // Debounce protection for video end events
  var lastVideoEndTimeRef = React.useRef(0);
  var VIDEO_END_DEBOUNCE_MS = 500;
  // Refs for audio normalization
  var audioContextRef = React.useRef(null);
  var analyserRef = React.useRef(null);
  var normalizationFactorRef = React.useRef(1.0);
  var isAnalyzingRef = React.useRef(false);
  // Debounce for play requests
  var playDebounceRef = React.useRef(null);
  // Dual-play check interval
  var dualPlayCheckIntervalRef = React.useRef(null);
  // Track if we're currently crossfading (for dual-play safeguard)
  var isCrossfadingRef = React.useRef(false);
  // Web Audio API functions for volume normalization
  var initializeAudioAnalysis = React.useCallback(function () {
    if (!enableAudioNormalization || !activeVideoRef.current || audioContextRef.current) return;
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      var source = audioContextRef.current.createMediaElementSource(activeVideoRef.current);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    } catch (error) {
      console.warn('[useVideoPlayer] Web Audio API not supported:', error);
    }
  }, [enableAudioNormalization, activeVideoRef]);
  var calculateRMS = React.useCallback(function (buffer) {
    var sum = 0;
    for (var i = 0; i < buffer.length; i++) {
      var sample = (buffer[i] - 128) / 128; // Convert to -1 to 1 range
      sum += sample * sample;
    }
    return Math.sqrt(sum / buffer.length);
  }, []);
  var analyzeVolume = React.useCallback(function () {
    if (!enableAudioNormalization || !analyserRef.current || isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    var bufferLength = analyserRef.current.frequencyBinCount;
    var dataArray = new Uint8Array(bufferLength);
    var totalRMS = 0;
    var sampleCount = 0;
    var targetRMS = 0.1; // Target RMS level (adjust as needed)
    var _analyze = function analyze() {
      if (sampleCount >= 60) {
        // Analyze for ~1 second at 60fps
        var averageRMS = totalRMS / sampleCount;
        normalizationFactorRef.current = targetRMS / averageRMS;
        normalizationFactorRef.current = Math.max(0.1, Math.min(2.0, normalizationFactorRef.current)); // Clamp between 0.1 and 2.0
        isAnalyzingRef.current = false;
        return;
      }
      analyserRef.current.getByteTimeDomainData(dataArray);
      var rms = calculateRMS(dataArray);
      totalRMS += rms;
      sampleCount++;
      requestAnimationFrame(_analyze);
    };
    _analyze();
  }, [enableAudioNormalization, calculateRMS]);
  var applyNormalization = React.useCallback(function () {
    if (!enableAudioNormalization || !activeVideoRef.current) return;
    var normalizedVolume = Math.min(1.0, volume * normalizationFactorRef.current);
    activeVideoRef.current.volume = normalizedVolume;
  }, [enableAudioNormalization, volume, activeVideoRef]);
  // Initialize video elements
  React.useEffect(function () {
    var videoA = videoARef.current;
    var videoB = videoBRef.current;
    if (videoA && videoB) {
      // Style video elements
      var durationMs = Math.max(100, Math.round((fadeDuration || 0.5) * 1000));
      [videoA, videoB].forEach(function (video) {
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.backgroundColor = 'black';
        video.style.transition = "opacity ".concat(durationMs, "ms ease-in-out");
        video.volume = volume;
      });
      // Initially hide video B
      videoB.style.opacity = '0';
      videoA.style.opacity = '1';
    }
  }, [volume, fadeDuration]);
  // Video event listeners
  React.useEffect(function () {
    var videoA = videoARef.current;
    var videoB = videoBRef.current;
    if (!videoA || !videoB) return;
    var handleVideoEnd = function handleVideoEnd(video) {
      if (video === activeVideoRef.current) {
        // DEBOUNCE: Prevent rapid-fire video end events (e.g., from failed video loads)
        var now = Date.now();
        var timeSinceLastEnd = now - lastVideoEndTimeRef.current;
        if (timeSinceLastEnd < VIDEO_END_DEBOUNCE_MS) {
          console.warn('[useVideoPlayer] Video end debounced - too rapid (' + timeSinceLastEnd + 'ms since last end)');
          return;
        }
        lastVideoEndTimeRef.current = now;
        // SIMPLIFIED: Video ended naturally - trigger next video
        console.log('[useVideoPlayer] Video ended naturally - advancing to next');
        onVideoEnd === null || onVideoEnd === void 0 || onVideoEnd();
        ipcAdapter.send('playback-ended', {
          videoId: currentVideo === null || currentVideo === void 0 ? void 0 : currentVideo.id,
          title: currentVideo === null || currentVideo === void 0 ? void 0 : currentVideo.title
        });
      }
    };
    var handleError = function handleError(video, error) {
      var errorCode = video.error ? video.error.code : 'unknown';
      var errorMessage = video.error ? video.error.message : 'Unknown error';
      console.error('[useVideoPlayer] Video error:', errorCode, errorMessage);
      handleVideoError(video, error);
    };
    var handleLoadedMetadata = function handleLoadedMetadata(video) {
      setDuration(video.duration);
    };
    // SIMPLIFIED: Just update current time, no early crossfade trigger
    var handleTimeUpdate = function handleTimeUpdate(video) {
      if (video === activeVideoRef.current && isPlaying) {
        setCurrentTime(video.currentTime);
      }
    };
    var handleCanPlayThrough = function handleCanPlayThrough() {
      setIsLoading(false);
    };
    var handlePlaying = function handlePlaying() {
      setIsPlaying(true);
      setIsLoading(false);
    };
    // Add event listeners
    [videoA, videoB].forEach(function (video) {
      video.addEventListener('ended', function () {
        return handleVideoEnd(video);
      });
      video.addEventListener('error', function (e) {
        return handleError(video, e);
      });
      video.addEventListener('loadedmetadata', function () {
        return handleLoadedMetadata(video);
      });
      video.addEventListener('timeupdate', function () {
        return handleTimeUpdate(video);
      });
      video.addEventListener('canplaythrough', handleCanPlayThrough);
      video.addEventListener('playing', handlePlaying);
    });
    return function () {
      [videoA, videoB].forEach(function (video) {
        video.removeEventListener('ended', function () {
          return handleVideoEnd(video);
        });
        video.removeEventListener('error', function (e) {
          return handleError(video, e);
        });
        video.removeEventListener('loadedmetadata', function () {
          return handleLoadedMetadata(video);
        });
        video.removeEventListener('timeupdate', function () {
          return handleTimeUpdate(video);
        });
        video.removeEventListener('canplaythrough', handleCanPlayThrough);
        video.removeEventListener('playing', handlePlaying);
      });
    };
  }, [activeVideoRef, currentVideo, ipcAdapter, onVideoEnd, isPlaying]);
  var handleVideoError = React.useCallback(function (video, error) {
    console.error('[useVideoPlayer] Handling video error, retry:', retryCountRef.current);
    setIsLoading(false); // Reset loading state on error
    var errorMessage = "Failed to play: ".concat((currentVideo === null || currentVideo === void 0 ? void 0 : currentVideo.title) || 'Unknown');
    setError(errorMessage);
    onError === null || onError === void 0 || onError(errorMessage);
    // Skip to next video after error
    setTimeout(function () {
      onVideoEnd === null || onVideoEnd === void 0 || onVideoEnd();
    }, 2000);
  }, [currentVideo, onVideoEnd, onError]);
  var playVideo = React.useCallback(function (video) {
    var videoId = video.id || video.path || video.src || '';
    // Prevent duplicate play requests for the same video
    if (isLoadingRef.current && lastPlayRequestRef.current === videoId) {
      console.log('[useVideoPlayer] Skipping duplicate play request for:', video.title);
      return;
    }
    // Clear any pending debounced play
    if (playDebounceRef.current) {
      clearTimeout(playDebounceRef.current);
    }
    // Mark as loading immediately using ref (sync)
    isLoadingRef.current = true;
    lastPlayRequestRef.current = videoId;
    console.log('[useVideoPlayer] Playing video:', video.title, 'by', video.artist);
    setCurrentVideo(video);
    setIsLoading(true);
    setError(null);
    // Reset normalization for new video
    normalizationFactorRef.current = 1.0;
    isAnalyzingRef.current = false;
    retryCountRef.current = 0;
    // Get video path
    var videoPath = video.src || video.path || video.file_path;
    if (!videoPath) {
      console.error('[useVideoPlayer] No video path found in video object:', video);
      setError('No video path');
      setIsLoading(false);
      isLoadingRef.current = false;
      return;
    }
    // Detect if we're in Electron (can use file://) or web browser (need http proxy)
    var isElectron = typeof window !== 'undefined' && !!window.electronAPI;
    // Get the current origin for relative URLs (handles port changes)
    var origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    // Check if we're in dev mode (loaded from localhost) - even in Electron, we need to use
    // the Vite proxy for local files because file:// URLs are blocked for security
    var isDevMode = origin.startsWith('http://localhost');
    var videoSrc;
    if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
      // Already an HTTP URL
      videoSrc = videoPath;
    } else if (videoPath.startsWith('/playlist/')) {
      // Vite proxy path - use current origin for proper port handling
      videoSrc = "".concat(origin).concat(videoPath);
    } else if (isElectron && !isDevMode) {
      // In production Electron (loaded from file://), we can use file:// URLs
      videoSrc = videoPath.startsWith('file://') ? videoPath : "file://".concat(videoPath);
    } else {
      // In web browser OR Electron dev mode, convert local path to Vite proxy URL
      // Extract playlist name and filename from path like /Users/.../PLAYLISTS/PlaylistName/filename.mp4
      var playlistMatch = videoPath.match(/PLAYLISTS\/([^\/]+)\/([^\/]+)$/);
      if (playlistMatch) {
        var _playlistMatch = _slicedToArray(playlistMatch, 3),
          playlistName = _playlistMatch[1],
          fileName = _playlistMatch[2];
        videoSrc = "".concat(origin, "/playlist/").concat(encodeURIComponent(playlistName), "/").concat(encodeURIComponent(fileName));
      } else {
        // Fallback - this won't work in browser but log it
        console.warn('[useVideoPlayer] Cannot convert local path to proxy URL:', videoPath);
        videoSrc = videoPath;
      }
    }
    console.log('[useVideoPlayer] Video source:', videoSrc);
    // SIMPLIFIED: Always use directPlay - no crossfade on auto-advancement
    directPlay(videoSrc);
  }, []);
  var directPlay = React.useCallback(function (videoSrc) {
    var activeVideo = activeVideoRef.current;
    if (!activeVideo) {
      isLoadingRef.current = false;
      return;
    }
    console.log('[useVideoPlayer] Direct play:', videoSrc);
    activeVideo.src = videoSrc;
    activeVideo.style.opacity = '1';
    activeVideo.volume = volume;
    activeVideo.style.display = 'block';
    if (inactiveVideoRef.current) {
      inactiveVideoRef.current.style.opacity = '0';
    }
    var playPromise = activeVideo.play();
    if (playPromise !== undefined) {
      playPromise.then(function () {
        console.log('[useVideoPlayer] Playback started successfully');
        setIsPlaying(true);
        setIsLoading(false);
        isLoadingRef.current = false;
        // Initialize audio analysis if enabled
        if (enableAudioNormalization) {
          initializeAudioAnalysis();
          // Start volume analysis after a short delay
          setTimeout(function () {
            analyzeVolume();
          }, 500);
        }
      })["catch"](function (error) {
        var _error$message;
        // Check if it's the "interrupted by new load" error - this is expected during rapid switching
        if (error.name === 'AbortError' || (_error$message = error.message) !== null && _error$message !== void 0 && _error$message.includes('interrupted')) {
          console.log('[useVideoPlayer] Play request was interrupted (expected during rapid switching)');
          // Don't treat this as an error - a new video is loading
          return;
        }
        console.error('[useVideoPlayer] Play failed:', error.message);
        // Try to play muted first (for autoplay policy)
        activeVideo.muted = true;
        activeVideo.play().then(function () {
          console.log('[useVideoPlayer] Playing muted due to autoplay policy');
          setIsPlaying(true);
          setIsLoading(false);
          isLoadingRef.current = false;
          setTimeout(function () {
            activeVideo.muted = false;
          }, 100);
        })["catch"](function (e) {
          isLoadingRef.current = false;
          handleVideoError(activeVideo, e);
        });
      });
    }
  }, [activeVideoRef, inactiveVideoRef, volume, handleVideoError, enableAudioNormalization, initializeAudioAnalysis, analyzeVolume]);
  // SKIP WITH FADE: User-initiated skip - fade out current video, then call onVideoEnd
  // This is the ONLY place crossfade/fade is used now
  var skipWithFade = React.useCallback(function () {
    if (isSkippingRef.current) {
      console.log('[useVideoPlayer] Skip already in progress, ignoring');
      return;
    }
    var activeVideo = activeVideoRef.current;
    if (!activeVideo) {
      console.log('[useVideoPlayer] No active video to skip');
      onVideoEnd === null || onVideoEnd === void 0 || onVideoEnd();
      return;
    }
    console.log('[useVideoPlayer] 🎬 User skip initiated - fading out current video');
    isSkippingRef.current = true;
    isCrossfadingRef.current = true;
    var startVolume = activeVideo.volume;
    var fadeStartTime = Date.now();
    var fadeDurationMs = Math.max(100, Math.round((fadeDuration || 0.5) * 1000));
    var _fadeOutStep = function fadeOutStep() {
      var elapsed = Date.now() - fadeStartTime;
      var progress = Math.min(elapsed / fadeDurationMs, 1);
      // Fade out volume and opacity
      activeVideo.volume = startVolume * (1 - progress);
      activeVideo.style.opacity = (1 - progress).toString();
      if (progress < 1) {
        requestAnimationFrame(_fadeOutStep);
      } else {
        // Fade complete - stop the video and trigger next
        activeVideo.pause();
        activeVideo.currentTime = 0;
        activeVideo.volume = volume; // Reset volume for next use
        activeVideo.style.opacity = '1'; // Reset opacity for next video
        isSkippingRef.current = false;
        isCrossfadingRef.current = false;
        console.log('[useVideoPlayer] ✅ Skip fade complete - triggering next video');
        // Trigger the next video
        onVideoEnd === null || onVideoEnd === void 0 || onVideoEnd();
        ipcAdapter.send('playback-ended', {
          videoId: currentVideo === null || currentVideo === void 0 ? void 0 : currentVideo.id,
          title: currentVideo === null || currentVideo === void 0 ? void 0 : currentVideo.title,
          skipped: true
        });
      }
    };
    requestAnimationFrame(_fadeOutStep);
  }, [activeVideoRef, volume, fadeDuration, onVideoEnd, ipcAdapter, currentVideo]);
  var pauseVideo = React.useCallback(function () {
    var activeVideo = activeVideoRef.current;
    if (activeVideo) {
      activeVideo.pause();
      setIsPlaying(false);
    }
  }, [activeVideoRef]);
  var resumeVideo = React.useCallback(function () {
    var activeVideo = activeVideoRef.current;
    if (activeVideo && currentVideo) {
      activeVideo.play().then(function () {
        setIsPlaying(true);
      })["catch"](function (error) {
        console.error('[useVideoPlayer] Resume failed:', error.message);
      });
    }
  }, [activeVideoRef, currentVideo]);
  var setVolume = React.useCallback(function (newVolume) {
    var clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);
    [videoARef.current, videoBRef.current].forEach(function (video) {
      if (video) video.volume = clampedVolume;
    });
    // Save volume preference
    ipcAdapter.send('save-volume', clampedVolume);
    console.log('[useVideoPlayer] Volume set to:', clampedVolume);
  }, [ipcAdapter]);
  var toggleMute = React.useCallback(function () {
    var newMuted = !isMuted;
    setIsMuted(newMuted);
    [videoARef.current, videoBRef.current].forEach(function (video) {
      if (video) video.muted = newMuted;
    });
    // Save mute state
    ipcAdapter.send('save-mute', newMuted);
    console.log('[useVideoPlayer] Mute toggled:', newMuted);
  }, [isMuted, ipcAdapter]);
  var seekTo = React.useCallback(function (time) {
    var activeVideo = activeVideoRef.current;
    if (activeVideo) {
      activeVideo.currentTime = time;
      setCurrentTime(time);
    }
  }, [activeVideoRef]);
  var retry = React.useCallback(function () {
    if (currentVideo) {
      playVideo(currentVideo);
    }
  }, [currentVideo, playVideo]);
  var preloadVideo = React.useCallback(function (video) {
    if (!video) return;
    var videoPath = video.src || video.path || video.file_path;
    if (!videoPath) {
      console.warn('[useVideoPlayer] preloadVideo: No video path available');
      return;
    }
    var videoSrc = videoPath.startsWith('http://') || videoPath.startsWith('https://') || videoPath.startsWith('/playlist/') ? videoPath.startsWith('/playlist/') ? "http://localhost:3000".concat(videoPath) : videoPath : videoPath.startsWith('file://') ? videoPath : "file://".concat(videoPath);
    var inactiveVideo = inactiveVideoRef.current;
    if (inactiveVideo) {
      try {
        console.log("[useVideoPlayer] \uD83D\uDCE5 Preloading into inactive element: ".concat(video.title));
        inactiveVideo.src = videoSrc;
        inactiveVideo.preload = 'auto';
        inactiveVideo.load();
        console.log("[useVideoPlayer] \u2705 Preload initiated for: ".concat(video.title));
      } catch (error) {
        console.warn('[useVideoPlayer] preload failed', error);
      }
    } else {
      console.warn('[useVideoPlayer] preloadVideo: No inactive video element available');
    }
  }, [inactiveVideoRef]);
  // Apply volume normalization periodically during playback
  React.useEffect(function () {
    if (!enableAudioNormalization) return;
    var interval = setInterval(function () {
      if (activeVideoRef.current && activeVideoRef.current.currentTime > 1 && !isAnalyzingRef.current) {
        applyNormalization();
      }
    }, 1000); // Check every second
    return function () {
      return clearInterval(interval);
    };
  }, [enableAudioNormalization, applyNormalization, activeVideoRef]);
  // SAFEGUARD: Detect and handle dual-play situations (both videos playing outside of crossfade)
  // This prevents state desync and ensures only the active video is playing
  React.useEffect(function () {
    var checkDualPlay = function checkDualPlay() {
      var videoA = videoARef.current;
      var videoB = videoBRef.current;
      var activeVideo = activeVideoRefRef.current.current;
      var inactiveVideo = inactiveVideoRefRef.current.current;
      if (!videoA || !videoB) return;
      // Check if both videos are playing
      var videoAPlaying = !videoA.paused && !videoA.ended && videoA.currentTime > 0;
      var videoBPlaying = !videoB.paused && !videoB.ended && videoB.currentTime > 0;
      // If both are playing and we're NOT in a crossfade, this is an error state
      if (videoAPlaying && videoBPlaying && !isCrossfadingRef.current) {
        console.warn('[useVideoPlayer] ⚠️ DUAL-PLAY DETECTED: Both videos playing outside of crossfade!');
        console.warn('[useVideoPlayer] Active video:', activeVideo === videoA ? 'A' : 'B');
        console.warn('[useVideoPlayer] Video A playing:', videoAPlaying, 'time:', videoA.currentTime.toFixed(2));
        console.warn('[useVideoPlayer] Video B playing:', videoBPlaying, 'time:', videoB.currentTime.toFixed(2));
        // Determine which video should be stopped (the inactive one)
        var videoToStop = inactiveVideo;
        if (videoToStop) {
          console.log('[useVideoPlayer] 🛑 Stopping incorrectly playing video with fade-out');
          // Fade out the incorrect video over 500ms
          var startVolume = videoToStop.volume;
          var fadeStartTime = Date.now();
          var fadeDurationMs = 500;
          var _fadeOutStep2 = function fadeOutStep() {
            var elapsed = Date.now() - fadeStartTime;
            var progress = Math.min(elapsed / fadeDurationMs, 1);
            // Fade out volume and opacity
            videoToStop.volume = startVolume * (1 - progress);
            videoToStop.style.opacity = (1 - progress).toString();
            if (progress < 1) {
              requestAnimationFrame(_fadeOutStep2);
            } else {
              // Fade complete - stop the video
              videoToStop.pause();
              videoToStop.currentTime = 0;
              videoToStop.volume = volume; // Reset volume for next use
              videoToStop.style.opacity = '0';
              console.log('[useVideoPlayer] ✅ Incorrectly playing video stopped and reset');
              // Ensure active video is at full opacity and volume
              if (activeVideo) {
                activeVideo.style.opacity = '1';
                activeVideo.volume = volume;
              }
            }
          };
          requestAnimationFrame(_fadeOutStep2);
        }
      }
    };
    // Check every 500ms for dual-play situations
    dualPlayCheckIntervalRef.current = setInterval(checkDualPlay, 500);
    return function () {
      if (dualPlayCheckIntervalRef.current) {
        clearInterval(dualPlayCheckIntervalRef.current);
        dualPlayCheckIntervalRef.current = null;
      }
    };
  }, [volume]);
  return {
    currentVideo: currentVideo,
    isPlaying: isPlaying,
    isLoading: isLoading,
    error: error,
    currentTime: currentTime,
    duration: duration,
    volume: volume,
    isMuted: isMuted,
    activeVideoElement: activeVideoRef.current,
    playVideo: playVideo,
    pauseVideo: pauseVideo,
    resumeVideo: resumeVideo,
    preloadVideo: preloadVideo,
    setVolume: setVolume,
    toggleMute: toggleMute,
    seekTo: seekTo,
    retry: retry,
    skipWithFade: skipWithFade // NEW: User-initiated skip with fade-out
  };
}

function fadeOut(video, duration, onProgress, onComplete) {
  return new Promise(function (resolve) {
    var startTime = Date.now();
    var startVolume = video.volume;
    var startOpacity = parseFloat(video.style.opacity) || 1;
    var _fadeStep2 = function fadeStep() {
      var elapsed = Date.now() - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var currentVolume = startVolume * (1 - progress);
      var currentOpacity = startOpacity * (1 - progress);
      video.volume = currentVolume;
      video.style.opacity = currentOpacity.toString();
      if (onProgress) {
        onProgress(progress, currentVolume, currentOpacity);
      }
      if (progress < 1) {
        requestAnimationFrame(_fadeStep2);
      } else {
        if (onComplete) {
          onComplete();
        }
        resolve();
      }
    };
    requestAnimationFrame(_fadeStep2);
  });
}

function useSkip(config) {
  var videoRefs = config.videoRefs;
    config.isPlaying;
    var onSkip = config.onSkip,
    fadeDurationMs = config.fadeDurationMs;
  React.useCallback(function () {
    var _videoRefs$activeVide;
    var activeVideo = (_videoRefs$activeVide = videoRefs.activeVideo) === null || _videoRefs$activeVide === void 0 ? void 0 : _videoRefs$activeVide.current;
    if (!activeVideo) return;
    console.log('[useSkip] Skipping immediately - pausing video');
    // Pause the video to prevent any further events
    activeVideo.pause();
    activeVideo.currentTime = 0;
    onSkip === null || onSkip === void 0 || onSkip();
  }, [videoRefs, onSkip]);
  var fadeOutAndSkip = React.useCallback(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
    var _videoRefs$activeVide2;
    var activeVideo;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          activeVideo = (_videoRefs$activeVide2 = videoRefs.activeVideo) === null || _videoRefs$activeVide2 === void 0 ? void 0 : _videoRefs$activeVide2.current;
          if (activeVideo) {
            _context.n = 1;
            break;
          }
          return _context.a(2);
        case 1:
          console.log('[useSkip] Starting fade-out');
          // Mark skip-in-progress so UI can hide loading overlays during transition
          try {
            window.__DJAMMS_SKIP_IN_PROGRESS__ = true;
          } catch (e) {
            /* ignore */
          }
          _context.n = 2;
          return fadeOut(activeVideo, fadeDurationMs !== null && fadeDurationMs !== void 0 ? fadeDurationMs : 1000, function (progress, volume, opacity) {
            // Progress callback if needed
          }, function () {
            // Fade complete
            console.log('[useSkip] Fade-out complete');
            // Call onSkip BEFORE pausing so the next playVideo() sees isPlaying=true
            // and uses the crossfade path instead of direct play.
            try {
              onSkip === null || onSkip === void 0 || onSkip();
            } catch (err) {
              console.error('[useSkip] onSkip handler threw:', err);
            }
            // Delay pausing/resetting the active video briefly to allow the
            // next player to initiate crossfade. This prevents the next
            // play from thinking playback was paused and doing a direct cut.
            setTimeout(function () {
              try {
                activeVideo.pause();
                activeVideo.currentTime = 0;
              } catch (e) {
                console.warn('[useSkip] Failed to pause/reset active video after skip:', e);
              }
              // Clear skip-in-progress flag after transition completes
              try {
                window.__DJAMMS_SKIP_IN_PROGRESS__ = false;
              } catch (e) {
                /* ignore */
              }
            }, 250);
          });
        case 2:
          return _context.a(2);
      }
    }, _callee);
  })), [videoRefs, onSkip]);
  var skip = React.useCallback(function () {
    var _videoRefs$activeVide3;
    console.log('[useSkip] skip() called');
    var activeVideo = (_videoRefs$activeVide3 = videoRefs.activeVideo) === null || _videoRefs$activeVide3 === void 0 ? void 0 : _videoRefs$activeVide3.current;
    if (!activeVideo) return;
    // Always perform fade-out when skipping, regardless of play state
    fadeOutAndSkip();
  }, [videoRefs, fadeOutAndSkip]);
  return {
    skip: skip
  };
}

// hooks/useKeyboardControls.ts
function useKeyboardControls(config) {
  var onAction = config.onAction,
    _config$enabled = config.enabled,
    enabled = _config$enabled === void 0 ? true : _config$enabled;
  var handleKeyDown = function handleKeyDown(e) {
    // Only handle if not in an input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    switch (e.code) {
      // Space bar play/pause DISABLED - causes accidental triggers
      // case 'Space':
      //   e.preventDefault();
      //   onAction('playPause');
      //   break;
      case 'KeyS':
        e.preventDefault();
        console.log('[useKeyboardControls] KeyS pressed');
        onAction('skip');
        break;
      case 'ArrowRight':
        e.preventDefault();
        console.log('[useKeyboardControls] ArrowRight pressed');
        onAction('skip');
        break;
      case 'ArrowUp':
        e.preventDefault();
        onAction('volumeUp');
        break;
      case 'ArrowDown':
        e.preventDefault();
        onAction('volumeDown');
        break;
      case 'KeyM':
        e.preventDefault();
        onAction('mute');
        break;
      case 'KeyF':
        e.preventDefault();
        onAction('fullscreen');
        break;
      case 'KeyN':
        e.preventDefault();
        onAction('next');
        break;
      case 'KeyP':
        e.preventDefault();
        onAction('previous');
        break;
    }
  };
  React.useEffect(function () {
    if (!enabled) return;
    document.addEventListener('keydown', handleKeyDown);
    return function () {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onAction]);
}

// components/DJAMMSPlayer.tsx
var DJAMMSPlayer = /*#__PURE__*/React.forwardRef(function (_ref, ref) {
  var _ref$width = _ref.width,
    width = _ref$width === void 0 ? 800 : _ref$width,
    _ref$height = _ref.height,
    height = _ref$height === void 0 ? 600 : _ref$height,
    _ref$className = _ref.className,
    className = _ref$className === void 0 ? '' : _ref$className,
    _ref$showControls = _ref.showControls,
    showControls = _ref$showControls === void 0 ? true : _ref$showControls,
    _ref$showProgress = _ref.showProgress,
    showProgress = _ref$showProgress === void 0 ? true : _ref$showProgress,
    _ref$showNowPlaying = _ref.showNowPlaying,
    showNowPlaying = _ref$showNowPlaying === void 0 ? true : _ref$showNowPlaying;
    _ref.autoPlay;
    var _ref$volume = _ref.volume,
    volume = _ref$volume === void 0 ? 0.7 : _ref$volume,
    _ref$showLoadingOverl = _ref.showLoadingOverlay,
    showLoadingOverlay = _ref$showLoadingOverl === void 0 ? false : _ref$showLoadingOverl,
    _ref$enableAudioNorma = _ref.enableAudioNormalization,
    enableAudioNormalization = _ref$enableAudioNorma === void 0 ? false : _ref$enableAudioNorma,
    _ref$fadeDuration = _ref.fadeDuration,
    fadeDuration = _ref$fadeDuration === void 0 ? 2.0 : _ref$fadeDuration,
    onVideoEnd = _ref.onVideoEnd,
    onSkip = _ref.onSkip,
    onError = _ref.onError,
    onStateChange = _ref.onStateChange;
  var videoRef1 = React.useRef(null);
  var videoRef2 = React.useRef(null);
  var _useVideoPlayer = useVideoPlayer({
      videoRefs: [videoRef1, videoRef2],
      initialVolume: volume,
      onVideoEnd: onVideoEnd,
      onError: onError,
      enableAudioNormalization: enableAudioNormalization,
      fadeDuration: fadeDuration
    }),
    currentVideo = _useVideoPlayer.currentVideo,
    isPlaying = _useVideoPlayer.isPlaying,
    isLoading = _useVideoPlayer.isLoading,
    error = _useVideoPlayer.error,
    currentTime = _useVideoPlayer.currentTime,
    duration = _useVideoPlayer.duration,
    playerVolume = _useVideoPlayer.volume;
    _useVideoPlayer.isMuted;
    var activeVideoElement = _useVideoPlayer.activeVideoElement,
    playVideo = _useVideoPlayer.playVideo,
    pauseVideo = _useVideoPlayer.pauseVideo,
    resumeVideo = _useVideoPlayer.resumeVideo,
    preloadVideo = _useVideoPlayer.preloadVideo,
    setVolume = _useVideoPlayer.setVolume,
    toggleMute = _useVideoPlayer.toggleMute,
    seekTo = _useVideoPlayer.seekTo,
    retry = _useVideoPlayer.retry,
    skipWithFade = _useVideoPlayer.skipWithFade;
  React.useEffect(function () {
    onStateChange === null || onStateChange === void 0 || onStateChange({
      currentVideo: currentVideo,
      currentTime: currentTime,
      duration: duration,
      isPlaying: isPlaying
    });
  }, [currentVideo, currentTime, duration, isPlaying, onStateChange]);
  // Build a VideoRefs-like object for useSkip. We derive active/inactive from
  // the activeVideoElement returned by the hook so skip targets the correct element.
  var activeRefObj = {
    current: activeVideoElement
  };
  var inactiveElem = activeVideoElement === videoRef1.current ? videoRef2.current : videoRef1.current;
  var inactiveRefObj = {
    current: inactiveElem
  };
  var videoRefsForSkip = {
    videoA: videoRef1,
    videoB: videoRef2,
    activeVideo: activeRefObj,
    inactiveVideo: inactiveRefObj
  };
  var _useSkip = useSkip({
      videoRefs: videoRefsForSkip,
      isPlaying: isPlaying,
      onSkip: onSkip,
      fadeDurationMs: fadeDuration ? Math.round(fadeDuration * 1000) : undefined
    }),
    skip = _useSkip.skip;
  var handleKeyboardAction = React.useCallback(function (action) {
    switch (action) {
      case 'skip':
        skip();
        break;
      case 'playPause':
        if (isPlaying) {
          pauseVideo();
        } else {
          resumeVideo();
        }
        break;
      case 'volumeUp':
        setVolume(Math.min(1, playerVolume + 0.1));
        break;
      case 'volumeDown':
        setVolume(Math.max(0, playerVolume - 0.1));
        break;
      case 'mute':
        toggleMute();
        break;
    }
  }, [skip, isPlaying, pauseVideo, resumeVideo, setVolume, playerVolume, toggleMute]);
  useKeyboardControls({
    onAction: handleKeyboardAction,
    enabled: showControls
  });
  // Expose methods via ref
  React.useImperativeHandle(ref, function () {
    return {
      playVideo: playVideo,
      pauseVideo: pauseVideo,
      resumeVideo: resumeVideo,
      setVolume: setVolume,
      toggleMute: toggleMute,
      seekTo: seekTo,
      getActiveVideo: function getActiveVideo() {
        return activeVideoElement;
      },
      preloadVideo: preloadVideo,
      skipWithFade: skipWithFade
    };
  }, [playVideo, pauseVideo, resumeVideo, setVolume, toggleMute, seekTo, activeVideoElement, preloadVideo, skipWithFade]);
  var handleProgressSeek = React.useCallback(function (time) {
    seekTo(time);
  }, [seekTo]);
  var handleRetry = React.useCallback(function () {
    retry();
  }, [retry]);
  return /*#__PURE__*/React.createElement("div", {
    className: "djamms-player ".concat(className),
    style: {
      position: 'relative',
      width: "".concat(width, "px"),
      height: "".concat(height, "px"),
      background: '#000',
      overflow: 'hidden',
      cursor: 'none',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(VideoElement, {
    ref: videoRef1,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      objectFit: 'contain'
    }
  }), /*#__PURE__*/React.createElement(VideoElement, {
    ref: videoRef2,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      objectFit: 'contain'
    }
  }), /*#__PURE__*/React.createElement(LoadingScreen, {
    visible: isLoading && showLoadingOverlay,
    message: "Loading video..."
  }), /*#__PURE__*/React.createElement(ErrorOverlay, {
    visible: !!error,
    error: error,
    onRetry: handleRetry
  }), showNowPlaying && currentVideo && (/*#__PURE__*/React.createElement(NowPlayingOverlay, {
    video: currentVideo,
    visible: !isLoading && !error,
    currentTime: currentTime,
    duration: duration
  })), showProgress && !isLoading && !error && (/*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      right: '20px',
      zIndex: 100
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    currentTime: currentTime,
    duration: duration,
    onSeek: handleProgressSeek
  }))), showControls && !isLoading && !error && (/*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: '60px',
      left: '20px',
      right: '20px',
      display: 'flex',
      justifyContent: 'center',
      gap: '10px',
      zIndex: 100
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return handleKeyboardAction('playPause');
    },
    style: {
      padding: '8px 16px',
      background: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      border: '1px solid white',
      borderRadius: '4px',
      cursor: 'pointer'
    }
  }, isPlaying ? '⏸️ Pause' : '▶️ Play'), /*#__PURE__*/React.createElement("button", {
    onClick: skip,
    style: {
      padding: '8px 16px',
      background: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      border: '1px solid white',
      borderRadius: '4px',
      cursor: 'pointer'
    }
  }, "\u23ED\uFE0F Skip"))));
});

// hooks/useQueueManager.ts
function useQueueManager() {
  var ipcAdapter = createIPCAdapter(true);
  var nextVideo = React.useCallback(function () {
    ipcAdapter.send('load-next-video');
  }, [ipcAdapter]);
  var previousVideo = React.useCallback(function () {
    ipcAdapter.send('load-previous-video');
  }, [ipcAdapter]);
  return {
    nextVideo: nextVideo,
    previousVideo: previousVideo
  };
}

// utils/time.ts
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  var mins = Math.floor(seconds / 60);
  var secs = Math.floor(seconds % 60);
  return "".concat(mins, ":").concat(secs.toString().padStart(2, '0'));
}

var Header = function Header(_ref) {
  var currentVideo = _ref.currentVideo,
    isPlaying = _ref.isPlaying,
    currentTime = _ref.currentTime,
    duration = _ref.duration,
    volume = _ref.volume,
    onPlayPause = _ref.onPlayPause,
    onSkip = _ref.onSkip,
    onPrevious = _ref.onPrevious,
    onSeek = _ref.onSeek,
    onVolumeChange = _ref.onVolumeChange,
    onSearch = _ref.onSearch,
    onSearchClear = _ref.onSearchClear,
    onMenuToggle = _ref.onMenuToggle,
    _ref$searchQuery = _ref.searchQuery,
    searchQuery = _ref$searchQuery === void 0 ? '' : _ref$searchQuery;
  var _useState = React.useState(searchQuery),
    _useState2 = _slicedToArray(_useState, 2),
    localSearch = _useState2[0],
    setLocalSearch = _useState2[1];
  var _useState3 = React.useState(false),
    _useState4 = _slicedToArray(_useState3, 2),
    isMuted = _useState4[0],
    setIsMuted = _useState4[1];
  var _useState5 = React.useState(volume),
    _useState6 = _slicedToArray(_useState5, 2),
    previousVolume = _useState6[0],
    setPreviousVolume = _useState6[1];
  var searchTimeoutRef = React.useRef(null);
  var progressRef = React.useRef(null);
  React.useEffect(function () {
    setLocalSearch(searchQuery);
  }, [searchQuery]);
  // Debounced search
  var handleSearchChange = React.useCallback(function (e) {
    var value = e.target.value;
    setLocalSearch(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(function () {
      onSearch(value);
    }, 150);
  }, [onSearch]);
  var handleSearchClear = React.useCallback(function () {
    setLocalSearch('');
    onSearchClear();
  }, [onSearchClear]);
  var handleSearchKeyDown = React.useCallback(function (e) {
    if (e.key === 'Escape') {
      handleSearchClear();
    }
  }, [handleSearchClear]);
  var handleProgressClick = React.useCallback(function (e) {
    if (!progressRef.current || duration === 0) return;
    var rect = progressRef.current.getBoundingClientRect();
    var percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  }, [duration, onSeek]);
  var handleVolumeToggle = React.useCallback(function () {
    if (isMuted || volume === 0) {
      setIsMuted(false);
      onVolumeChange(previousVolume > 0 ? previousVolume : 0.7);
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
      onVolumeChange(0);
    }
  }, [isMuted, volume, previousVolume, onVolumeChange]);
  var handleVolumeSlider = React.useCallback(function (e) {
    var newVolume = parseFloat(e.target.value);
    onVolumeChange(newVolume);
    setIsMuted(newVolume === 0);
  }, [onVolumeChange]);
  var progressPercent = duration > 0 ? currentTime / duration * 100 : 0;
  return /*#__PURE__*/React.createElement("header", {
    className: "app-header drag-region"
  }, /*#__PURE__*/React.createElement("button", {
    className: "control-btn no-drag",
    onClick: onMenuToggle,
    "aria-label": "Toggle sidebar"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "header-logo no-drag"
  }, "DJAMMS"), /*#__PURE__*/React.createElement("div", {
    className: "header-now-playing no-drag"
  }, /*#__PURE__*/React.createElement("div", {
    className: "now-playing-thumbnail"
  }, currentVideo ? (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
  }))) : (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "now-playing-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "now-playing-title"
  }, (currentVideo === null || currentVideo === void 0 ? void 0 : currentVideo.title) || 'No video playing'), /*#__PURE__*/React.createElement("div", {
    className: "now-playing-artist"
  }, (currentVideo === null || currentVideo === void 0 ? void 0 : currentVideo.artist) || 'Select a video to play'))), /*#__PURE__*/React.createElement("div", {
    className: "playback-controls no-drag"
  }, /*#__PURE__*/React.createElement("button", {
    className: "control-btn",
    onClick: onPrevious,
    "aria-label": "Previous"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 6h2v12H6zm3.5 6l8.5 6V6z"
  }))), /*#__PURE__*/React.createElement("button", {
    className: "control-btn primary",
    onClick: onPlayPause,
    "aria-label": isPlaying ? 'Pause' : 'Play'
  }, isPlaying ? (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 19h4V5H6v14zm8-14v14h4V5h-4z"
  }))) : (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 5v14l11-7z"
  })))), /*#__PURE__*/React.createElement("button", {
    className: "control-btn",
    onClick: onSkip,
    "aria-label": "Next"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "header-progress no-drag"
  }, /*#__PURE__*/React.createElement("span", {
    className: "progress-time"
  }, formatTime(currentTime)), /*#__PURE__*/React.createElement("div", {
    className: "progress-bar",
    ref: progressRef,
    onClick: handleProgressClick
  }, /*#__PURE__*/React.createElement("div", {
    className: "progress-fill",
    style: {
      width: "".concat(progressPercent, "%")
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "progress-time"
  }, formatTime(duration))), /*#__PURE__*/React.createElement("div", {
    className: "volume-control no-drag"
  }, /*#__PURE__*/React.createElement("button", {
    className: "control-btn",
    onClick: handleVolumeToggle,
    "aria-label": isMuted ? 'Unmute' : 'Mute'
  }, isMuted || volume === 0 ? (/*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
  }))) : volume < 0.5 ? (/*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"
  }))) : (/*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
  })))), /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "volume-slider",
    min: "0",
    max: "1",
    step: "0.01",
    value: isMuted ? 0 : volume,
    onChange: handleVolumeSlider,
    "aria-label": "Volume"
  })), /*#__PURE__*/React.createElement("div", {
    className: "header-search no-drag"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Search videos...",
    value: localSearch,
    onChange: handleSearchChange,
    onKeyDown: handleSearchKeyDown,
    "aria-label": "Search videos"
  }), localSearch ? (/*#__PURE__*/React.createElement("button", {
    className: "search-icon",
    onClick: handleSearchClear,
    style: {
      cursor: 'pointer',
      pointerEvents: 'auto'
    },
    "aria-label": "Clear search"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
  })))) : (/*#__PURE__*/React.createElement("span", {
    className: "search-icon"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
  }))))));
};

// src/components/Sidebar.tsx
var navItems$1 = [{
  id: 'queue',
  label: 'Queue',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
  })))
}, {
  id: 'search',
  label: 'Search',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
  })))
}, {
  id: 'browse',
  label: 'Browse',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
  })))
}, {
  id: 'settings',
  label: 'Settings',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
  })))
}, {
  id: 'tools',
  label: 'Tools',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"
  })))
}];
var Sidebar = function Sidebar(_ref) {
  var collapsed = _ref.collapsed,
    activeTab = _ref.activeTab,
    playlists = _ref.playlists,
    currentPlaylist = _ref.currentPlaylist,
    onTabChange = _ref.onTabChange,
    onPlaylistSelect = _ref.onPlaylistSelect;
  var playlistNames = Object.keys(playlists);
  return /*#__PURE__*/React.createElement("aside", {
    className: "sidebar ".concat(collapsed ? 'collapsed' : '')
  }, /*#__PURE__*/React.createElement("nav", {
    className: "sidebar-nav"
  }, navItems$1.map(function (item) {
    return /*#__PURE__*/React.createElement("button", {
      key: item.id,
      className: "nav-item ".concat(activeTab === item.id ? 'active' : ''),
      onClick: function onClick() {
        return onTabChange(item.id);
      },
      title: collapsed ? item.label : undefined
    }, /*#__PURE__*/React.createElement("span", {
      className: "nav-icon"
    }, item.icon), /*#__PURE__*/React.createElement("span", {
      className: "nav-label"
    }, item.label));
  })), /*#__PURE__*/React.createElement("div", {
    className: "sidebar-playlists"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sidebar-section-title"
  }, "Playlists"), playlistNames.length === 0 ? (/*#__PURE__*/React.createElement("div", {
    className: "playlist-nav-item",
    style: {
      cursor: 'default'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "playlist-icon"
  }, "\uD83D\uDCC2"), /*#__PURE__*/React.createElement("span", {
    className: "playlist-name",
    style: {
      color: 'var(--yt-text-muted)'
    }
  }, "No playlists found"))) : playlistNames.map(function (name) {
    return /*#__PURE__*/React.createElement("div", {
      key: name,
      className: "playlist-nav-item ".concat(currentPlaylist === name ? 'active' : ''),
      onClick: function onClick() {
        return onPlaylistSelect(name);
      },
      title: collapsed ? name : undefined
    }, /*#__PURE__*/React.createElement("span", {
      className: "playlist-icon"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
    }))), /*#__PURE__*/React.createElement("span", {
      className: "playlist-name"
    }, name));
  })));
};

var QueueTab = function QueueTab(_ref) {
  var queue = _ref.queue,
    currentIndex = _ref.currentIndex;
    _ref.currentVideo;
    var onPlayVideo = _ref.onPlayVideo,
    onRemoveFromQueue = _ref.onRemoveFromQueue;
  if (queue.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "tab-content"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state-icon"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "64",
      height: "64",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "empty-state-title"
    }, "Queue is empty"), /*#__PURE__*/React.createElement("div", {
      className: "empty-state-description"
    }, "Browse or search for videos and add them to your queue to start playing.")));
  }
  // Reorder queue: "up next" videos first (after currentIndex), then "already played" (before currentIndex)
  // The current video is NOT shown in this list - it's displayed in NOW PLAYING section
  var upNextVideos = queue.slice(currentIndex + 1); // Videos after current
  var alreadyPlayedVideos = queue.slice(0, currentIndex); // Videos before current
  var reorderedQueue = [].concat(_toConsumableArray(upNextVideos), _toConsumableArray(alreadyPlayedVideos));
  // Map to track original indices for click handling
  var getOriginalIndex = function getOriginalIndex(reorderedIndex) {
    if (reorderedIndex < upNextVideos.length) {
      // It's in the "up next" section
      return currentIndex + 1 + reorderedIndex;
    } else {
      // It's in the "already played" section
      return reorderedIndex - upNextVideos.length;
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "tab-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "queue-list"
  }, reorderedQueue.map(function (video, reorderedIndex) {
    var originalIndex = getOriginalIndex(reorderedIndex);
    var isUpNext = reorderedIndex < upNextVideos.length;
    return /*#__PURE__*/React.createElement("div", {
      key: "".concat(video.id, "-").concat(originalIndex),
      className: "queue-item ".concat(!isUpNext ? 'played' : ''),
      onClick: function onClick() {
        return onPlayVideo(originalIndex);
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "queue-item-index"
    }, reorderedIndex + 1), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-thumbnail"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "20",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-info"
    }, /*#__PURE__*/React.createElement("div", {
      className: "queue-item-title"
    }, cleanVideoTitle(video.title)), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-artist"
    }, video.artist || 'Unknown Artist')), /*#__PURE__*/React.createElement("span", {
      className: "queue-item-duration"
    }, video.duration ? formatTime(video.duration) : '--:--'), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-actions"
    }, /*#__PURE__*/React.createElement("button", {
      className: "queue-action-btn",
      onClick: function onClick(e) {
        e.stopPropagation();
        onRemoveFromQueue(video.id);
      },
      title: "Remove from queue"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
    })))));
  })));
};

// src/components/ToolsTab.tsx
var tools = [{
  id: 'fullscreen',
  title: 'Open Fullscreen Player',
  description: 'Launch the video player in a separate fullscreen window on another display.',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
  }))),
  electronOnly: true
}, {
  id: 'refresh',
  title: 'Refresh Playlists',
  description: 'Rescan the playlists directory to detect any new or removed videos.',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
  }))),
  electronOnly: false
}, {
  id: 'clear-queue',
  title: 'Clear Queue',
  description: 'Remove all videos from the current playback queue.',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
  }))),
  electronOnly: false
}, {
  id: 'shuffle-all',
  title: 'Shuffle All Videos',
  description: 'Create a queue with all videos from all playlists randomly shuffled.',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
  }))),
  electronOnly: false
}, {
  id: 'export-queue',
  title: 'Export Queue',
  description: 'Save the current queue as a playlist file for later use.',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"
  }))),
  electronOnly: true
}, {
  id: 'keyboard-shortcuts',
  title: 'Keyboard Shortcuts',
  description: 'View and customize keyboard shortcuts for playback control.',
  icon: (/*#__PURE__*/React.createElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"
  }))),
  electronOnly: false
}];
var ToolsTab = function ToolsTab(_ref) {
  var isElectron = _ref.isElectron,
    onOpenFullscreen = _ref.onOpenFullscreen,
    onRefreshPlaylists = _ref.onRefreshPlaylists,
    onClearQueue = _ref.onClearQueue;
  var handleToolClick = function handleToolClick(toolId) {
    switch (toolId) {
      case 'fullscreen':
        onOpenFullscreen();
        break;
      case 'refresh':
        onRefreshPlaylists();
        break;
      case 'clear-queue':
        onClearQueue();
        break;
      case 'shuffle-all':
        // TODO: Implement shuffle all
        console.log('Shuffle all videos');
        break;
      case 'export-queue':
        // TODO: Implement export queue
        console.log('Export queue');
        break;
      case 'keyboard-shortcuts':
        // TODO: Show keyboard shortcuts modal
        console.log('Show keyboard shortcuts');
        break;
    }
  };
  var visibleTools = tools.filter(function (tool) {
    return !tool.electronOnly || isElectron;
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "tab-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tools-grid"
  }, visibleTools.map(function (tool) {
    return /*#__PURE__*/React.createElement("div", {
      key: tool.id,
      className: "tool-card",
      onClick: function onClick() {
        return handleToolClick(tool.id);
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "tool-card-icon"
    }, tool.icon), /*#__PURE__*/React.createElement("div", {
      className: "tool-card-title"
    }, tool.title), /*#__PURE__*/React.createElement("div", {
      className: "tool-card-description"
    }, tool.description));
  })));
};

// components/NowPlayingPanel.tsx
var NowPlayingPanel = function NowPlayingPanel(_ref) {
  var currentVideo = _ref.currentVideo,
    currentTime = _ref.currentTime,
    duration = _ref.duration,
    isPlaying = _ref.isPlaying,
    selectedPlaylist = _ref.selectedPlaylist,
    playlist = _ref.playlist,
    currentIndex = _ref.currentIndex,
    playlists = _ref.playlists,
    onPlaylistChange = _ref.onPlaylistChange,
    onPlayPause = _ref.onPlayPause,
    onSkip = _ref.onSkip,
    onShuffle = _ref.onShuffle;
  var formatTime = function formatTime(time) {
    var minutes = Math.floor(time / 60);
    var seconds = Math.floor(time % 60);
    return "".concat(minutes, ":").concat(seconds.toString().padStart(2, '0'));
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 400px',
      padding: '20px',
      border: '1px solid #ddd',
      borderRadius: '8px',
      backgroundColor: '#f8f9fa'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 20px 0',
      fontSize: '18px'
    }
  }, "Now Playing"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '16px',
      marginBottom: '10px',
      fontWeight: 'bold'
    }
  }, "Now Playing: ", currentVideo ? "".concat(cleanVideoTitle(currentVideo.title)).concat(currentVideo.artist !== 'Unknown Artist' ? " by ".concat(currentVideo.artist) : '') : 'None'), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: '10px',
      background: '#ddd',
      borderRadius: '5px',
      marginRight: '10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: "".concat(duration > 0 ? currentTime / duration * 100 : 0, "%"),
      background: '#007bff',
      borderRadius: '5px'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      whiteSpace: 'nowrap'
    }
  }, formatTime(currentTime), " / ", formatTime(duration)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '20px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      marginBottom: '8px',
      fontSize: '14px',
      fontWeight: 'bold'
    }
  }, "Selected Playlist:"), /*#__PURE__*/React.createElement("select", {
    value: selectedPlaylist,
    onChange: onPlaylistChange,
    style: {
      width: '100%',
      padding: '10px',
      fontSize: '14px',
      backgroundColor: '#007bff',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Select Playlist"), Object.keys(playlists).map(function (name) {
    return /*#__PURE__*/React.createElement("option", {
      key: name,
      value: name
    }, name);
  })), playlist.length > 0 && (/*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '8px',
      fontSize: '12px',
      color: '#666'
    }
  }, playlist.length, " videos | Current: ", playlist[currentIndex] ? "".concat(cleanVideoTitle(playlist[currentIndex].title)).concat(playlist[currentIndex].artist !== 'Unknown Artist' ? " by ".concat(playlist[currentIndex].artist) : '') : 'None'))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onPlayPause,
    style: {
      flex: 1,
      padding: '10px 16px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      border: '1px solid white',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  }, isPlaying ? '⏸️ Pause' : '▶️ Play'), /*#__PURE__*/React.createElement("button", {
    onClick: onSkip,
    style: {
      flex: 1,
      padding: '10px 16px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      border: '1px solid white',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  }, "\u23ED\uFE0F Skip"), /*#__PURE__*/React.createElement("button", {
    onClick: onShuffle,
    style: {
      flex: 1,
      padding: '10px 16px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      border: '1px solid white',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  }, "\uD83D\uDD00 Shuffle")));
};

// components/VideoPlayer.tsx
var VideoPlayer = /*#__PURE__*/React.forwardRef(function (_ref, ref) {
  var _ref$width = _ref.width,
    width = _ref$width === void 0 ? 800 : _ref$width,
    _ref$height = _ref.height,
    height = _ref$height === void 0 ? 600 : _ref$height,
    _ref$showControls = _ref.showControls,
    showControls = _ref$showControls === void 0 ? false : _ref$showControls,
    _ref$showProgress = _ref.showProgress,
    showProgress = _ref$showProgress === void 0 ? false : _ref$showProgress,
    _ref$showNowPlaying = _ref.showNowPlaying,
    showNowPlaying = _ref$showNowPlaying === void 0 ? false : _ref$showNowPlaying,
    _ref$autoPlay = _ref.autoPlay,
    autoPlay = _ref$autoPlay === void 0 ? false : _ref$autoPlay,
    _ref$volume = _ref.volume,
    volume = _ref$volume === void 0 ? 0.7 : _ref$volume,
    _ref$showLoadingOverl = _ref.showLoadingOverlay,
    showLoadingOverlay = _ref$showLoadingOverl === void 0 ? false : _ref$showLoadingOverl,
    _ref$enableAudioNorma = _ref.enableAudioNormalization,
    enableAudioNormalization = _ref$enableAudioNorma === void 0 ? false : _ref$enableAudioNorma,
    _ref$fadeDuration = _ref.fadeDuration,
    fadeDuration = _ref$fadeDuration === void 0 ? 2.0 : _ref$fadeDuration,
    onVideoEnd = _ref.onVideoEnd,
    onSkip = _ref.onSkip,
    onError = _ref.onError,
    onStateChange = _ref.onStateChange;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(DJAMMSPlayer, {
    ref: ref,
    width: width,
    height: height,
    showControls: showControls,
    showProgress: showProgress,
    showNowPlaying: showNowPlaying,
    autoPlay: autoPlay,
    showLoadingOverlay: showLoadingOverlay,
    volume: volume,
    fadeDuration: fadeDuration,
    onVideoEnd: onVideoEnd,
    onSkip: onSkip,
    onError: onError,
    onStateChange: onStateChange,
    enableAudioNormalization: enableAudioNormalization
  }));
});

// components/TabNavigation.tsx
var TabNavigation = function TabNavigation(_ref) {
  var activeTab = _ref.activeTab,
    tabs = _ref.tabs,
    onTabChange = _ref.onTabChange;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '20px',
      borderBottom: '1px solid #ddd'
    }
  }, tabs.map(function (tab) {
    return /*#__PURE__*/React.createElement("button", {
      key: tab.id,
      onClick: function onClick() {
        return onTabChange(tab.id);
      },
      style: {
        padding: '10px 20px',
        backgroundColor: activeTab === tab.id ? '#007bff' : '#f8f9fa',
        color: activeTab === tab.id ? 'white' : '#333',
        border: 'none',
        borderRadius: '4px 4px 0 0',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 'bold'
      }
    }, tab.icon, " ", tab.label);
  }));
};

// components/PlaylistTab.tsx
var PlaylistTab = function PlaylistTab(_ref) {
  var playlist = _ref.playlist,
    currentIndex = _ref.currentIndex,
    currentVideo = _ref.currentVideo,
    onPlayVideo = _ref.onPlayVideo,
    onRemoveFromQueue = _ref.onRemoveFromQueue;
  if (playlist.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "demo-section"
    }, /*#__PURE__*/React.createElement("h2", null, "Playlist"), /*#__PURE__*/React.createElement("p", null, "No playlist loaded. Select a playlist from the dropdown above."));
  }
  // Reorder playlist so current playing song is at the top
  var reorderedPlaylist = React.useMemo(function () {
    if (currentIndex < 0 || currentIndex >= playlist.length) {
      return playlist.map(function (video, index) {
        return {
          video: video,
          originalIndex: index
        };
      });
    }
    var result = [];
    // Add current song and everything after it
    for (var i = currentIndex; i < playlist.length; i++) {
      result.push({
        video: playlist[i],
        originalIndex: i
      });
    }
    // Add everything before current song
    for (var _i = 0; _i < currentIndex; _i++) {
      result.push({
        video: playlist[_i],
        originalIndex: _i
      });
    }
    return result;
  }, [playlist, currentIndex]);
  return /*#__PURE__*/React.createElement("div", {
    className: "demo-section"
  }, /*#__PURE__*/React.createElement("h2", null, "Playlist"), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: '400px',
      overflowY: 'auto'
    }
  }, reorderedPlaylist.map(function (_ref2, displayIndex) {
    var video = _ref2.video,
      originalIndex = _ref2.originalIndex;
    return /*#__PURE__*/React.createElement("div", {
      key: "".concat(video.id, "-").concat(originalIndex),
      style: {
        padding: '8px',
        borderBottom: '1px solid #eee',
        backgroundColor: currentVideo && video.id === currentVideo.id ? '#e3f2fd' : 'transparent',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, originalIndex + 1, ". ", cleanVideoTitle(video.title), video.artist !== 'Unknown Artist' ? " by ".concat(video.artist) : '', currentVideo && video.id === currentVideo.id && (/*#__PURE__*/React.createElement("span", {
      style: {
        color: '#1976d2',
        fontWeight: 'bold',
        marginLeft: '8px'
      }
    }, "(NOW PLAYING)"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: '5px'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function onClick() {
        return onPlayVideo(originalIndex);
      },
      style: {
        background: 'green',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '4px 8px',
        cursor: 'pointer',
        fontSize: '14px'
      },
      title: "Play this video"
    }, "\u25B6\uFE0F"), /*#__PURE__*/React.createElement("button", {
      onClick: function onClick() {
        return onRemoveFromQueue(video.id);
      },
      style: {
        background: 'red',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '4px 8px',
        cursor: 'pointer',
        fontSize: '14px'
      },
      title: "Remove from queue"
    }, "\uD83D\uDDD1\uFE0F")));
  })));
};

/**
 * Player ID Utilities for Electron App
 *
 * Electron Player CAN claim/create new Player IDs.
 * This is in contrast to Web apps which can only connect to existing IDs.
 */
// Lazy import to avoid bundling Supabase in library build
var _supabaseService = null;
var getSupabaseServiceLazy = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
    var module;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          if (_supabaseService) {
            _context.n = 2;
            break;
          }
          _context.n = 1;
          return Promise.resolve().then(function () { return SupabaseService$1; });
        case 1:
          module = _context.v;
          _supabaseService = module.getSupabaseService();
        case 2:
          return _context.a(2, _supabaseService);
      }
    }, _callee);
  }));
  return function getSupabaseServiceLazy() {
    return _ref.apply(this, arguments);
  };
}();
// Storage key for localStorage (used in renderer process)
var STORAGE_KEY = 'djamms_player_id';
// Default Player ID
var DEFAULT_PLAYER_ID$1 = 'DEMO_PLAYER';
// Minimum length for Player IDs
var MIN_PLAYER_ID_LENGTH = 6;
/**
 * Get stored Player ID from localStorage
 */
function getPlayerId() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem(STORAGE_KEY) || null;
}
/**
 * Store Player ID in localStorage (uppercase)
 */
function setPlayerId(id) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, id.toUpperCase());
}
/**
 * Clear stored Player ID
 */
function clearPlayerId() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}
/**
 * Validate Player ID format (local check only)
 */
function isValidPlayerIdFormat(id) {
  var clean = id.trim().toUpperCase();
  return clean.length >= MIN_PLAYER_ID_LENGTH;
}
/**
 * Validate that a Player ID exists in the database
 */
function validatePlayerId(_x) {
  return _validatePlayerId.apply(this, arguments);
}
/**
 * Claim a new Player ID (Electron only)
 * Creates a new player record in the database
 * Returns true if successful, false if already taken or error
 */
function _validatePlayerId() {
  _validatePlayerId = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(id) {
    var clean, supabase, client, _yield$client$from$se, data, error, _t;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.p = _context2.n) {
        case 0:
          clean = id.trim().toUpperCase();
          if (!(clean.length < MIN_PLAYER_ID_LENGTH)) {
            _context2.n = 1;
            break;
          }
          return _context2.a(2, false);
        case 1:
          _context2.p = 1;
          _context2.n = 2;
          return getSupabaseServiceLazy();
        case 2:
          supabase = _context2.v;
          client = supabase.getClient();
          if (client) {
            _context2.n = 3;
            break;
          }
          console.error('[playerUtils] Supabase client not available');
          return _context2.a(2, false);
        case 3:
          _context2.n = 4;
          return client.from('players').select('player_id').eq('player_id', clean).single();
        case 4:
          _yield$client$from$se = _context2.v;
          data = _yield$client$from$se.data;
          error = _yield$client$from$se.error;
          if (!error) {
            _context2.n = 6;
            break;
          }
          if (!(error.code === 'PGRST116')) {
            _context2.n = 5;
            break;
          }
          return _context2.a(2, false);
        case 5:
          console.error('[playerUtils] Error validating Player ID:', error);
          return _context2.a(2, false);
        case 6:
          return _context2.a(2, !!data);
        case 7:
          _context2.p = 7;
          _t = _context2.v;
          console.error('[playerUtils] Exception validating Player ID:', _t);
          return _context2.a(2, false);
      }
    }, _callee2, null, [[1, 7]]);
  }));
  return _validatePlayerId.apply(this, arguments);
}
function claimPlayerId(_x2, _x3) {
  return _claimPlayerId.apply(this, arguments);
}
/**
 * Get player info from database
 */
function _claimPlayerId() {
  _claimPlayerId = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(id, name) {
    var clean, supabase, client, _yield$client$from$in, error, _t2;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.p = _context3.n) {
        case 0:
          clean = id.trim().toUpperCase();
          if (!(clean.length < MIN_PLAYER_ID_LENGTH)) {
            _context3.n = 1;
            break;
          }
          return _context3.a(2, {
            success: false,
            error: "Player ID must be at least ".concat(MIN_PLAYER_ID_LENGTH, " characters")
          });
        case 1:
          _context3.p = 1;
          _context3.n = 2;
          return getSupabaseServiceLazy();
        case 2:
          supabase = _context3.v;
          client = supabase.getClient();
          if (client) {
            _context3.n = 3;
            break;
          }
          return _context3.a(2, {
            success: false,
            error: 'Supabase client not available'
          });
        case 3:
          _context3.n = 4;
          return client.from('players').insert({
            player_id: clean,
            name: name || null
          });
        case 4:
          _yield$client$from$in = _context3.v;
          error = _yield$client$from$in.error;
          if (!error) {
            _context3.n = 6;
            break;
          }
          if (!(error.code === '23505')) {
            _context3.n = 5;
            break;
          }
          return _context3.a(2, {
            success: false,
            error: 'Player ID already exists'
          });
        case 5:
          console.error('[playerUtils] Error claiming Player ID:', error);
          return _context3.a(2, {
            success: false,
            error: error.message
          });
        case 6:
          // Store in localStorage
          setPlayerId(clean);
          return _context3.a(2, {
            success: true
          });
        case 7:
          _context3.p = 7;
          _t2 = _context3.v;
          console.error('[playerUtils] Exception claiming Player ID:', _t2);
          return _context3.a(2, {
            success: false,
            error: 'Failed to claim Player ID'
          });
      }
    }, _callee3, null, [[1, 7]]);
  }));
  return _claimPlayerId.apply(this, arguments);
}
function generateRandomPlayerId() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var result = 'DJAMMS_';
  for (var i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
/**
 * Initialize Player ID on app startup
 * - If stored ID exists and is valid, use it
 * - If no stored ID, try to claim DEFAULT_PLAYER_ID
 * - If DEFAULT taken, generate and claim a random ID
 */
function initializePlayerId() {
  return _initializePlayerId.apply(this, arguments);
}
function _initializePlayerId() {
  _initializePlayerId = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5() {
    var storedId, isValid, defaultResult, defaultExists, attempts, randomId, result;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          // Check for stored ID
          storedId = getPlayerId();
          if (!storedId) {
            _context5.n = 3;
            break;
          }
          _context5.n = 1;
          return validatePlayerId(storedId);
        case 1:
          isValid = _context5.v;
          if (!isValid) {
            _context5.n = 2;
            break;
          }
          console.log('[playerUtils] Using stored Player ID:', storedId);
          return _context5.a(2, storedId);
        case 2:
          console.warn('[playerUtils] Stored Player ID no longer valid, will claim new ID');
          clearPlayerId();
        case 3:
          // Try to claim default ID
          console.log('[playerUtils] Attempting to claim default Player ID:', DEFAULT_PLAYER_ID$1);
          _context5.n = 4;
          return claimPlayerId(DEFAULT_PLAYER_ID$1);
        case 4:
          defaultResult = _context5.v;
          if (!defaultResult.success) {
            _context5.n = 5;
            break;
          }
          console.log('[playerUtils] Claimed default Player ID:', DEFAULT_PLAYER_ID$1);
          return _context5.a(2, DEFAULT_PLAYER_ID$1);
        case 5:
          _context5.n = 6;
          return validatePlayerId(DEFAULT_PLAYER_ID$1);
        case 6:
          defaultExists = _context5.v;
          if (!defaultExists) {
            _context5.n = 7;
            break;
          }
          console.log('[playerUtils] Default Player ID exists, using it:', DEFAULT_PLAYER_ID$1);
          setPlayerId(DEFAULT_PLAYER_ID$1);
          return _context5.a(2, DEFAULT_PLAYER_ID$1);
        case 7:
          // Generate random ID
          attempts = 0;
        case 8:
          if (!(attempts < 10)) {
            _context5.n = 11;
            break;
          }
          randomId = generateRandomPlayerId();
          console.log('[playerUtils] Attempting to claim random Player ID:', randomId);
          _context5.n = 9;
          return claimPlayerId(randomId);
        case 9:
          result = _context5.v;
          if (!result.success) {
            _context5.n = 10;
            break;
          }
          console.log('[playerUtils] Claimed random Player ID:', randomId);
          return _context5.a(2, randomId);
        case 10:
          attempts++;
          _context5.n = 8;
          break;
        case 11:
          // Fallback - shouldn't happen
          console.error('[playerUtils] Failed to claim any Player ID after 10 attempts');
          throw new Error('Failed to initialize Player ID');
        case 12:
          return _context5.a(2);
      }
    }, _callee5);
  }));
  return _initializePlayerId.apply(this, arguments);
}

var SettingsTab = function SettingsTab(_ref) {
  var settings = _ref.settings,
    onUpdateSetting = _ref.onUpdateSetting,
    playerId = _ref.playerId,
    onPlayerIdChange = _ref.onPlayerIdChange;
  var _useState = React.useState(false),
    _useState2 = _slicedToArray(_useState, 2),
    isEditingPlayerId = _useState2[0],
    setIsEditingPlayerId = _useState2[1];
  var _useState3 = React.useState(''),
    _useState4 = _slicedToArray(_useState3, 2),
    newPlayerId = _useState4[0],
    setNewPlayerId = _useState4[1];
  var _useState5 = React.useState(null),
    _useState6 = _slicedToArray(_useState5, 2),
    playerIdError = _useState6[0],
    setPlayerIdError = _useState6[1];
  var _useState7 = React.useState(false),
    _useState8 = _slicedToArray(_useState7, 2),
    isChangingPlayerId = _useState8[0],
    setIsChangingPlayerId = _useState8[1];
  var handleStartEdit = React.useCallback(function () {
    setNewPlayerId('');
    setPlayerIdError(null);
    setIsEditingPlayerId(true);
  }, []);
  var handleCancelEdit = React.useCallback(function () {
    setIsEditingPlayerId(false);
    setNewPlayerId('');
    setPlayerIdError(null);
  }, []);
  var handleChangePlayerId = React.useCallback(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
    var clean, exists, result;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          clean = newPlayerId.trim().toUpperCase(); // Validate format
          if (isValidPlayerIdFormat(clean)) {
            _context.n = 1;
            break;
          }
          setPlayerIdError("Player ID must be at least ".concat(MIN_PLAYER_ID_LENGTH, " characters"));
          return _context.a(2);
        case 1:
          if (!(clean === playerId)) {
            _context.n = 2;
            break;
          }
          setPlayerIdError('This is already your current Player ID');
          return _context.a(2);
        case 2:
          setIsChangingPlayerId(true);
          setPlayerIdError(null);
          _context.p = 3;
          _context.n = 4;
          return validatePlayerId(clean);
        case 4:
          exists = _context.v;
          if (!exists) {
            _context.n = 5;
            break;
          }
          // ID exists - just switch to it (assume user owns it or it's shared)
          onPlayerIdChange(clean);
          setIsEditingPlayerId(false);
          setNewPlayerId('');
          _context.n = 7;
          break;
        case 5:
          _context.n = 6;
          return claimPlayerId(clean);
        case 6:
          result = _context.v;
          if (result.success) {
            onPlayerIdChange(clean);
            setIsEditingPlayerId(false);
            setNewPlayerId('');
          } else {
            setPlayerIdError(result.error || 'Failed to claim Player ID');
          }
        case 7:
          _context.n = 9;
          break;
        case 8:
          _context.p = 8;
          _context.v;
          setPlayerIdError('Failed to change Player ID');
        case 9:
          _context.p = 9;
          setIsChangingPlayerId(false);
          return _context.f(9);
        case 10:
          return _context.a(2);
      }
    }, _callee, null, [[3, 8, 9, 10]]);
  })), [newPlayerId, playerId, onPlayerIdChange]);
  return /*#__PURE__*/React.createElement("div", {
    className: "settings-container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-section"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "settings-section-title"
  }, "Player Identity"), /*#__PURE__*/React.createElement("div", {
    className: "settings-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-label"
  }, "Player ID"), /*#__PURE__*/React.createElement("div", {
    className: "settings-item-description"
  }, "Unique identifier for this player instance. Web Admin and Kiosk apps connect using this ID.")), !isEditingPlayerId ? (/*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'monospace',
      fontSize: '14px',
      fontWeight: 600,
      color: 'var(--yt-spec-call-to-action)',
      backgroundColor: 'rgba(62, 166, 255, 0.1)',
      padding: '6px 12px',
      borderRadius: '6px',
      letterSpacing: '0.5px'
    }
  }, playerId), /*#__PURE__*/React.createElement("button", {
    onClick: handleStartEdit,
    style: {
      padding: '6px 12px',
      fontSize: '13px',
      backgroundColor: 'var(--yt-spec-badge-chip-background)',
      color: 'var(--yt-text-primary)',
      border: '1px solid var(--yt-spec-10-percent-layer)',
      borderRadius: '6px',
      cursor: 'pointer',
      transition: 'background-color 0.2s'
    },
    onMouseEnter: function onMouseEnter(e) {
      return e.currentTarget.style.backgroundColor = 'var(--yt-spec-10-percent-layer)';
    },
    onMouseLeave: function onMouseLeave(e) {
      return e.currentTarget.style.backgroundColor = 'var(--yt-spec-badge-chip-background)';
    }
  }, "Change"))) : (/*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: newPlayerId,
    onChange: function onChange(e) {
      setNewPlayerId(e.target.value.toUpperCase());
      setPlayerIdError(null);
    },
    placeholder: "Enter new Player ID",
    disabled: isChangingPlayerId,
    style: {
      padding: '8px 12px',
      fontSize: '14px',
      fontFamily: 'monospace',
      backgroundColor: 'var(--yt-spec-badge-chip-background)',
      color: 'var(--yt-text-primary)',
      border: playerIdError ? '1px solid var(--yt-spec-brand-button-background)' : '1px solid var(--yt-spec-10-percent-layer)',
      borderRadius: '6px',
      outline: 'none',
      width: '200px',
      textTransform: 'uppercase'
    },
    onKeyDown: function onKeyDown(e) {
      if (e.key === 'Enter' && !isChangingPlayerId) {
        handleChangePlayerId();
      } else if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    autoFocus: true
  }), /*#__PURE__*/React.createElement("button", {
    onClick: handleChangePlayerId,
    disabled: isChangingPlayerId || !newPlayerId.trim(),
    style: {
      padding: '8px 16px',
      fontSize: '13px',
      backgroundColor: isChangingPlayerId ? 'var(--yt-spec-badge-chip-background)' : 'var(--yt-spec-call-to-action)',
      color: isChangingPlayerId ? 'var(--yt-text-secondary)' : 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: isChangingPlayerId ? 'not-allowed' : 'pointer',
      fontWeight: 500
    }
  }, isChangingPlayerId ? 'Saving...' : 'Save'), /*#__PURE__*/React.createElement("button", {
    onClick: handleCancelEdit,
    disabled: isChangingPlayerId,
    style: {
      padding: '8px 12px',
      fontSize: '13px',
      backgroundColor: 'transparent',
      color: 'var(--yt-text-secondary)',
      border: '1px solid var(--yt-spec-10-percent-layer)',
      borderRadius: '6px',
      cursor: isChangingPlayerId ? 'not-allowed' : 'pointer'
    }
  }, "Cancel")), playerIdError && (/*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: 'var(--yt-spec-brand-button-background)',
      marginLeft: '4px'
    }
  }, playerIdError)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      color: 'var(--yt-text-secondary)',
      marginLeft: '4px'
    }
  }, "Min ", MIN_PLAYER_ID_LENGTH, " characters. Will create if not exists."))))), /*#__PURE__*/React.createElement("div", {
    className: "settings-section"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "settings-section-title"
  }, "Playback"), /*#__PURE__*/React.createElement("div", {
    className: "settings-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-label"
  }, "Auto-shuffle Playlists"), /*#__PURE__*/React.createElement("div", {
    className: "settings-item-description"
  }, "Automatically shuffle playlist order when loading")), /*#__PURE__*/React.createElement("div", {
    className: "toggle-switch ".concat(settings.autoShufflePlaylists ? 'active' : ''),
    onClick: function onClick() {
      return onUpdateSetting('autoShufflePlaylists', !settings.autoShufflePlaylists);
    },
    role: "switch",
    "aria-checked": settings.autoShufflePlaylists,
    tabIndex: 0,
    onKeyDown: function onKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        onUpdateSetting('autoShufflePlaylists', !settings.autoShufflePlaylists);
      }
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "settings-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-label"
  }, "Crossfade Duration"), /*#__PURE__*/React.createElement("div", {
    className: "settings-item-description"
  }, "Duration of audio/video crossfade between tracks")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "settings-slider",
    min: 0.5,
    max: 4.0,
    step: 0.5,
    value: settings.fadeDuration,
    onChange: function onChange(e) {
      return onUpdateSetting('fadeDuration', parseFloat(e.target.value));
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: '40px',
      textAlign: 'right',
      color: 'var(--yt-text-primary)',
      fontSize: '14px',
      fontWeight: 500
    }
  }, settings.fadeDuration.toFixed(1), "s")))), /*#__PURE__*/React.createElement("div", {
    className: "settings-section"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "settings-section-title"
  }, "Audio"), /*#__PURE__*/React.createElement("div", {
    className: "settings-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-label"
  }, "Normalize Audio Levels"), /*#__PURE__*/React.createElement("div", {
    className: "settings-item-description"
  }, "Apply volume normalization for consistent audio levels across tracks")), /*#__PURE__*/React.createElement("div", {
    className: "toggle-switch ".concat(settings.normalizeAudioLevels ? 'active' : ''),
    onClick: function onClick() {
      return onUpdateSetting('normalizeAudioLevels', !settings.normalizeAudioLevels);
    },
    role: "switch",
    "aria-checked": settings.normalizeAudioLevels,
    tabIndex: 0,
    onKeyDown: function onKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        onUpdateSetting('normalizeAudioLevels', !settings.normalizeAudioLevels);
      }
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "settings-section"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "settings-section-title"
  }, "Display"), /*#__PURE__*/React.createElement("div", {
    className: "settings-item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-item-label"
  }, "Fullscreen Player Mode"), /*#__PURE__*/React.createElement("div", {
    className: "settings-item-description"
  }, "Enable syncing to a fullscreen player window on a secondary display")), /*#__PURE__*/React.createElement("div", {
    className: "toggle-switch ".concat(settings.enableFullscreenPlayer ? 'active' : ''),
    onClick: function onClick() {
      return onUpdateSetting('enableFullscreenPlayer', !settings.enableFullscreenPlayer);
    },
    role: "switch",
    "aria-checked": settings.enableFullscreenPlayer,
    tabIndex: 0,
    onKeyDown: function onKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        onUpdateSetting('enableFullscreenPlayer', !settings.enableFullscreenPlayer);
      }
    }
  }))));
};

var FullscreenPlayer = /*#__PURE__*/React.forwardRef(function (_ref, ref) {
  var video = _ref.video,
    isPlaying = _ref.isPlaying,
    currentTime = _ref.currentTime,
    duration = _ref.duration,
    volume = _ref.volume,
    onVideoEnd = _ref.onVideoEnd,
    onStateChange = _ref.onStateChange,
    enableAudioNormalization = _ref.enableAudioNormalization,
    preloadVideo = _ref.preloadVideo,
    fadeDuration = _ref.fadeDuration,
    seekToPosition = _ref.seekToPosition,
    onSeekComplete = _ref.onSeekComplete,
    overlaySettings = _ref.overlaySettings,
    _ref$upcomingVideos = _ref.upcomingVideos,
    upcomingVideos = _ref$upcomingVideos === void 0 ? [] : _ref$upcomingVideos;
  var playerRef = React.useRef(null);
  var prevVideoRef = React.useRef(null);
  var prevIsPlayingRef = React.useRef(false);
  // Expose skipWithFade to parent via ref
  React.useImperativeHandle(ref, function () {
    return {
      skipWithFade: function skipWithFade() {
        if (playerRef.current) {
          playerRef.current.skipWithFade();
        }
      }
    };
  }, []);
  // Get the next video from upcoming videos array for "Coming Up" ticker
  var nextVideo = upcomingVideos.length > 0 ? upcomingVideos[0] : null;
  // Track window dimensions for responsive video sizing
  var _useState = React.useState({
      width: window.innerWidth,
      height: window.innerHeight
    }),
    _useState2 = _slicedToArray(_useState, 2),
    dimensions = _useState2[0],
    setDimensions = _useState2[1];
  // Listen for window resize events
  React.useEffect(function () {
    var handleResize = function handleResize() {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    // Also handle fullscreen changes
    var handleFullscreenChange = function handleFullscreenChange() {
      // Small delay to let the browser update dimensions
      setTimeout(handleResize, 100);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return function () {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  // Handle volume changes from Main Window
  React.useEffect(function () {
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
    }
  }, [volume]);
  // Handle seek requests (e.g., debug skip to end)
  React.useEffect(function () {
    if (seekToPosition !== null && seekToPosition !== undefined && playerRef.current) {
      console.log("[FullscreenPlayer] Seeking to position: ".concat(seekToPosition, "s"));
      playerRef.current.seekTo(seekToPosition);
      if (onSeekComplete) {
        onSeekComplete();
      }
    }
  }, [seekToPosition, onSeekComplete]);
  React.useEffect(function () {
    // Handle video playback changes
    if (video && playerRef.current) {
      var _prevVideoRef$current;
      var videoChanged = ((_prevVideoRef$current = prevVideoRef.current) === null || _prevVideoRef$current === void 0 ? void 0 : _prevVideoRef$current.id) !== video.id;
      var wasPaused = !prevIsPlayingRef.current && isPlaying;
      if (isPlaying) {
        if (videoChanged) {
          // New video - start playing from beginning
          playerRef.current.playVideo(video);
        } else if (wasPaused) {
          // Same video, was paused, now resuming - resume playback
          var activeVideo = playerRef.current.getActiveVideo();
          if (activeVideo) {
            activeVideo.play()["catch"](function (error) {
              console.error('Resume failed:', error);
            });
          }
        }
      } else {
        // Pause
        playerRef.current.pauseVideo();
      }
    }
    // Update refs for next comparison
    prevVideoRef.current = video;
    prevIsPlayingRef.current = isPlaying;
  }, [video, isPlaying]);
  // If parent requests a preload of the next video, load it into the inactive element
  React.useEffect(function () {
    if (preloadVideo && playerRef.current && preloadVideo !== video) {
      try {
        playerRef.current.preloadVideo(preloadVideo);
      } catch (error) {
        console.warn('FullscreenPlayer preload failed', error);
      }
    }
  }, [preloadVideo, playerRef, video]);
  var handleStateChange = function handleStateChange(state) {
    onStateChange({
      currentVideo: video,
      currentTime: state.currentTime || 0,
      duration: state.duration || 0,
      isPlaying: state.isPlaying || false
    });
  };
  if (!video) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '24px',
        cursor: 'none'
      }
    }, "No video selected");
  }
  // Calculate progress percentage for the now playing overlay
  var progressPercent = duration > 0 ? currentTime / duration * 100 : 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      position: 'relative',
      cursor: 'none',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(DJAMMSPlayer, {
    ref: playerRef,
    width: dimensions.width,
    height: dimensions.height,
    showControls: false,
    showProgress: false,
    showNowPlaying: false,
    showLoadingOverlay: false,
    autoPlay: true,
    volume: volume,
    fadeDuration: fadeDuration,
    onVideoEnd: onVideoEnd,
    onStateChange: handleStateChange,
    enableAudioNormalization: enableAudioNormalization
  }), (overlaySettings === null || overlaySettings === void 0 ? void 0 : overlaySettings.showNowPlaying) && video && (/*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: "".concat(overlaySettings.nowPlayingX, "%"),
      top: "".concat(overlaySettings.nowPlayingY, "%"),
      transform: "scale(".concat(overlaySettings.nowPlayingSize / 100, ")"),
      transformOrigin: 'bottom left',
      background: 'linear-gradient(135deg, rgba(0,0,0,0.85) 0%, rgba(20,20,30,0.9) 100%)',
      color: 'white',
      padding: '20px 28px',
      borderRadius: '16px',
      maxWidth: '450px',
      zIndex: 1000,
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.1)',
      opacity: overlaySettings.nowPlayingOpacity / 100
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      color: '#00bfff',
      textTransform: 'uppercase',
      letterSpacing: '2px',
      marginBottom: '8px',
      fontWeight: 600
    }
  }, "Now Playing"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '22px',
      fontWeight: 'bold',
      marginBottom: '6px',
      textShadow: '0 2px 4px rgba(0,0,0,0.3)'
    }
  }, cleanVideoTitle(video.title)), video.artist && video.artist !== 'Unknown Artist' && (/*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '16px',
      color: '#aaa',
      marginBottom: '14px'
    }
  }, video.artist)), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '4px',
      background: 'rgba(255,255,255,0.2)',
      borderRadius: '2px',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "".concat(progressPercent, "%"),
      height: '100%',
      background: 'linear-gradient(90deg, #00bfff, #0080ff)',
      transition: 'width 0.3s ease'
    }
  })))), (overlaySettings === null || overlaySettings === void 0 ? void 0 : overlaySettings.showComingUp) && nextVideo && (/*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: "".concat(overlaySettings.comingUpX, "%"),
      top: "".concat(overlaySettings.comingUpY, "%"),
      transform: "scale(".concat(overlaySettings.comingUpSize / 100, ")"),
      transformOrigin: 'bottom left',
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '8px',
      zIndex: 1000,
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      opacity: overlaySettings.comingUpOpacity / 100
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      color: '#ffaa00',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      fontWeight: 600
    }
  }, "Coming Up"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      color: '#ddd'
    }
  }, cleanVideoTitle(nextVideo.title), nextVideo.artist && nextVideo.artist !== 'Unknown Artist' && (/*#__PURE__*/React.createElement("span", {
    style: {
      color: '#888'
    }
  }, " \u2014 ", nextVideo.artist))))), (overlaySettings === null || overlaySettings === void 0 ? void 0 : overlaySettings.showWatermark) && overlaySettings.watermarkImage && (/*#__PURE__*/React.createElement("img", {
    src: overlaySettings.watermarkImage,
    alt: "",
    style: {
      position: 'absolute',
      top: "".concat(overlaySettings.watermarkY, "%"),
      left: "".concat(overlaySettings.watermarkX, "%"),
      transform: 'translate(-50%, -50%)',
      width: "".concat(overlaySettings.watermarkSize, "px"),
      height: 'auto',
      opacity: overlaySettings.watermarkOpacity / 100,
      zIndex: 999,
      pointerEvents: 'none',
      filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))'
    }
  })));
});

var SearchBar = function SearchBar(_ref) {
  var onSearch = _ref.onSearch,
    onClear = _ref.onClear,
    _ref$placeholder = _ref.placeholder,
    placeholder = _ref$placeholder === void 0 ? 'Search videos...' : _ref$placeholder,
    _ref$recentSearches = _ref.recentSearches,
    recentSearches = _ref$recentSearches === void 0 ? [] : _ref$recentSearches,
    onRecentSearchClick = _ref.onRecentSearchClick,
    _ref$isSearching = _ref.isSearching,
    isSearching = _ref$isSearching === void 0 ? false : _ref$isSearching,
    _ref$className = _ref.className,
    className = _ref$className === void 0 ? '' : _ref$className,
    _ref$autoFocus = _ref.autoFocus,
    autoFocus = _ref$autoFocus === void 0 ? false : _ref$autoFocus;
  var _useState = React.useState(''),
    _useState2 = _slicedToArray(_useState, 2),
    query = _useState2[0],
    setQuery = _useState2[1];
  var _useState3 = React.useState(false),
    _useState4 = _slicedToArray(_useState3, 2),
    showRecent = _useState4[0],
    setShowRecent = _useState4[1];
  var inputRef = React.useRef(null);
  var containerRef = React.useRef(null);
  // Handle outside clicks to close recent searches dropdown
  React.useEffect(function () {
    var handleClickOutside = function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowRecent(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return function () {
      return document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  // Auto focus
  React.useEffect(function () {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);
  var handleSubmit = React.useCallback(function (e) {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setShowRecent(false);
    }
  }, [query, onSearch]);
  var handleChange = React.useCallback(function (e) {
    var value = e.target.value;
    setQuery(value);
    // Trigger search as user types (debounced in parent)
    if (value.trim()) {
      onSearch(value.trim());
    }
  }, [onSearch]);
  var handleClear = React.useCallback(function () {
    var _inputRef$current;
    setQuery('');
    onClear === null || onClear === void 0 || onClear();
    (_inputRef$current = inputRef.current) === null || _inputRef$current === void 0 || _inputRef$current.focus();
  }, [onClear]);
  var handleRecentClick = React.useCallback(function (recentQuery) {
    setQuery(recentQuery);
    onRecentSearchClick === null || onRecentSearchClick === void 0 || onRecentSearchClick(recentQuery);
    setShowRecent(false);
  }, [onRecentSearchClick]);
  var handleKeyDown = React.useCallback(function (e) {
    if (e.key === 'Escape') {
      handleClear();
      setShowRecent(false);
    }
  }, [handleClear]);
  return /*#__PURE__*/React.createElement("div", {
    ref: containerRef,
    className: "search-bar-container relative ".concat(className)
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "search-form"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative flex items-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute left-3 text-gray-400 pointer-events-none"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "w-5 h-5",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24"
  }, /*#__PURE__*/React.createElement("path", {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
  }))), /*#__PURE__*/React.createElement("input", {
    ref: inputRef,
    type: "text",
    value: query,
    onChange: handleChange,
    onFocus: function onFocus() {
      return setShowRecent(true);
    },
    onKeyDown: handleKeyDown,
    placeholder: placeholder,
    className: "w-full pl-10 pr-10 py-3 bg-gray-800/80 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",
    autoComplete: "off",
    spellCheck: false
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute right-3"
  }, isSearching ? (/*#__PURE__*/React.createElement("div", {
    className: "animate-spin"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "w-5 h-5 text-blue-500",
    fill: "none",
    viewBox: "0 0 24 24"
  }, /*#__PURE__*/React.createElement("circle", {
    className: "opacity-25",
    cx: "12",
    cy: "12",
    r: "10",
    stroke: "currentColor",
    strokeWidth: "4"
  }), /*#__PURE__*/React.createElement("path", {
    className: "opacity-75",
    fill: "currentColor",
    d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
  })))) : query && (/*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: handleClear,
    className: "text-gray-400 hover:text-white transition-colors"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "w-5 h-5",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24"
  }, /*#__PURE__*/React.createElement("path", {
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    d: "M6 18L18 6M6 6l12 12"
  }))))))), showRecent && recentSearches.length > 0 && !query && (/*#__PURE__*/React.createElement("div", {
    className: "absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-3 py-2 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700"
  }, "Recent Searches"), /*#__PURE__*/React.createElement("div", {
    className: "max-h-64 overflow-y-auto"
  }, recentSearches.map(function (recent, index) {
    return /*#__PURE__*/React.createElement("button", {
      key: index,
      type: "button",
      onClick: function onClick() {
        return handleRecentClick(recent);
      },
      className: "w-full px-3 py-2 text-left text-gray-300 hover:bg-gray-700 flex items-center gap-2 transition-colors"
    }, /*#__PURE__*/React.createElement("svg", {
      className: "w-4 h-4 text-gray-500",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24"
    }, /*#__PURE__*/React.createElement("path", {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2,
      d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    })), /*#__PURE__*/React.createElement("span", {
      className: "truncate"
    }, recent));
  })))));
};

var VideoPopover$1 = function VideoPopover(_ref) {
  var video = _ref.video,
    position = _ref.position,
    onAddToPriorityQueue = _ref.onAddToPriorityQueue,
    onCancel = _ref.onCancel;
  var popoverRef = React.useRef(null);
  React.useEffect(function () {
    var handleClickOutside = function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onCancel();
      }
    };
    var handleEscape = function handleEscape(e) {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return function () {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);
  // Adjust position to stay within viewport
  var adjustedPosition = React.useMemo(function () {
    var popoverWidth = 300;
    var popoverHeight = 150;
    var padding = 16;
    var x = position.x;
    var y = position.y;
    if (x + popoverWidth > window.innerWidth - padding) {
      x = window.innerWidth - popoverWidth - padding;
    }
    if (y + popoverHeight > window.innerHeight - padding) {
      y = window.innerHeight - popoverHeight - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;
    return {
      x: x,
      y: y
    };
  }, [position]);
  var artistDisplay = video.artist && video.artist !== 'Unknown' && video.artist.toLowerCase() !== 'unknown artist' ? video.artist : '';
  return /*#__PURE__*/React.createElement("div", {
    ref: popoverRef,
    className: "video-popover",
    style: {
      position: 'fixed',
      left: adjustedPosition.x,
      top: adjustedPosition.y,
      zIndex: 9999,
      background: 'var(--yt-bg-elevated, #282828)',
      border: '1px solid var(--yt-border-subtle, #3f3f3f)',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      minWidth: '280px',
      maxWidth: '360px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '16px',
      fontWeight: 600,
      color: 'var(--yt-text-primary, #fff)',
      marginBottom: '4px',
      wordBreak: 'break-word'
    }
  }, artistDisplay ? "".concat(artistDisplay, " - ").concat(cleanVideoTitle(video.title)) : cleanVideoTitle(video.title)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      color: 'var(--yt-text-secondary, #aaa)',
      marginTop: '8px'
    }
  }, "Add to Priority Queue?")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '12px',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onCancel,
    style: {
      padding: '10px 20px',
      background: 'var(--yt-bg-tertiary, #3f3f3f)',
      border: 'none',
      borderRadius: '8px',
      color: 'var(--yt-text-primary, #fff)',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    onMouseEnter: function onMouseEnter(e) {
      return e.currentTarget.style.background = 'var(--yt-bg-hover, #4f4f4f)';
    },
    onMouseLeave: function onMouseLeave(e) {
      return e.currentTarget.style.background = 'var(--yt-bg-tertiary, #3f3f3f)';
    }
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: onAddToPriorityQueue,
    style: {
      padding: '10px 20px',
      background: 'var(--yt-accent-primary, #3ea6ff)',
      border: 'none',
      borderRadius: '8px',
      color: '#000',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    onMouseEnter: function onMouseEnter(e) {
      return e.currentTarget.style.background = 'var(--yt-accent-hover, #65b8ff)';
    },
    onMouseLeave: function onMouseLeave(e) {
      return e.currentTarget.style.background = 'var(--yt-accent-primary, #3ea6ff)';
    }
  }, "Add Video")));
};
var SearchResults = function SearchResults(_ref2) {
  var results = _ref2.results,
    onPlayVideo = _ref2.onPlayVideo,
    onAddToQueue = _ref2.onAddToQueue,
    onAddToPriorityQueue = _ref2.onAddToPriorityQueue,
    _ref2$isLoading = _ref2.isLoading,
    isLoading = _ref2$isLoading === void 0 ? false : _ref2$isLoading,
    _ref2$query = _ref2.query,
    query = _ref2$query === void 0 ? '' : _ref2$query,
    _ref2$className = _ref2.className,
    className = _ref2$className === void 0 ? '' : _ref2$className;
  var _useState = React.useState(null),
    _useState2 = _slicedToArray(_useState, 2),
    popoverVideo = _useState2[0],
    setPopoverVideo = _useState2[1];
  var _useState3 = React.useState({
      x: 0,
      y: 0
    }),
    _useState4 = _slicedToArray(_useState3, 2),
    popoverPosition = _useState4[0],
    setPopoverPosition = _useState4[1];
  var handleVideoClick = React.useCallback(function (video, event) {
    event.stopPropagation();
    setPopoverVideo(video);
    setPopoverPosition({
      x: event.clientX,
      y: event.clientY
    });
  }, []);
  var handleAddToPriorityQueue = React.useCallback(function () {
    if (popoverVideo && onAddToPriorityQueue) {
      onAddToPriorityQueue(popoverVideo);
    }
    setPopoverVideo(null);
  }, [popoverVideo, onAddToPriorityQueue]);
  var handleClosePopover = React.useCallback(function () {
    setPopoverVideo(null);
  }, []);
  var highlightMatch = React.useCallback(function (text, matches) {
    if (!matches || matches.length === 0) return text;
    // Find matches for this text
    var textMatch = matches.find(function (m) {
      return m.value === text;
    });
    if (!textMatch || !textMatch.indices || textMatch.indices.length === 0) {
      return text;
    }
    // Build highlighted text
    var parts = [];
    var lastIndex = 0;
    var _iterator = _createForOfIteratorHelper(textMatch.indices),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var _step$value = _slicedToArray(_step.value, 2),
          start = _step$value[0],
          end = _step$value[1];
        if (start > lastIndex) {
          parts.push(text.slice(lastIndex, start));
        }
        parts.push(/*#__PURE__*/React.createElement("span", {
          key: "".concat(start, "-").concat(end),
          className: "search-highlight"
        }, text.slice(start, end + 1)));
        lastIndex = end + 1;
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return /*#__PURE__*/React.createElement(React.Fragment, null, parts);
  }, []);
  if (isLoading) {
    return /*#__PURE__*/React.createElement("div", {
      className: "search-results ".concat(className)
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, /*#__PURE__*/React.createElement("div", {
      className: "loading-spinner",
      style: {
        marginBottom: '16px'
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "empty-state-title"
    }, "Searching...")));
  }
  if (results.length === 0 && query) {
    return /*#__PURE__*/React.createElement("div", {
      className: "search-results ".concat(className)
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state-icon"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "64",
      height: "64",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "empty-state-title"
    }, "No results found"), /*#__PURE__*/React.createElement("div", {
      className: "empty-state-description"
    }, "Try different keywords or check your spelling")));
  }
  if (results.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "search-results ".concat(className)
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state-icon"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "64",
      height: "64",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "empty-state-title"
    }, "Search your library"), /*#__PURE__*/React.createElement("div", {
      className: "empty-state-description"
    }, "Type in the search bar above to find videos")));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "search-results ".concat(className)
  }, /*#__PURE__*/React.createElement("div", {
    className: "queue-list"
  }, results.map(function (result, index) {
    var video = result.item;
    var relevancePercent = Math.round((1 - (result.score || 0)) * 100);
    return /*#__PURE__*/React.createElement("div", {
      key: video.id || index,
      className: "queue-item",
      onClick: function onClick(e) {
        return handleVideoClick(video, e);
      },
      style: {
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "queue-item-thumbnail"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "20",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M8 5v14l11-7z"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-info"
    }, /*#__PURE__*/React.createElement("div", {
      className: "queue-item-title"
    }, highlightMatch(video.title, result.matches)), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-artist"
    }, highlightMatch(video.artist || 'Unknown Artist', result.matches), video.playlist && (/*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--yt-text-muted)'
      }
    }, " \u2022 ", video.playlist)))), result.score !== undefined && (/*#__PURE__*/React.createElement("span", {
      className: "queue-item-duration",
      style: {
        color: relevancePercent > 70 ? 'var(--yt-accent-primary)' : relevancePercent > 40 ? 'var(--yt-text-secondary)' : 'var(--yt-text-muted)'
      }
    }, relevancePercent, "%")), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-actions"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "queue-action-btn",
      onClick: function onClick(e) {
        e.stopPropagation();
        onPlayVideo(video);
      },
      title: "Play now"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M8 5v14l11-7z"
    }))), /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "queue-action-btn",
      onClick: function onClick(e) {
        e.stopPropagation();
        onAddToQueue(video);
      },
      title: "Add to queue"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
    })))));
  })), popoverVideo && (/*#__PURE__*/React.createElement(VideoPopover$1, {
    video: popoverVideo,
    position: popoverPosition,
    onAddToPriorityQueue: handleAddToPriorityQueue,
    onCancel: handleClosePopover
  })));
};

var VideoPopover = function VideoPopover(_ref) {
  var video = _ref.video,
    position = _ref.position,
    onAddToPriorityQueue = _ref.onAddToPriorityQueue,
    onCancel = _ref.onCancel;
  var popoverRef = React.useRef(null);
  React.useEffect(function () {
    var handleClickOutside = function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onCancel();
      }
    };
    var handleEscape = function handleEscape(e) {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return function () {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);
  // Adjust position to stay within viewport
  var adjustedPosition = React.useMemo(function () {
    var popoverWidth = 300;
    var popoverHeight = 150;
    var padding = 16;
    var x = position.x;
    var y = position.y;
    if (x + popoverWidth > window.innerWidth - padding) {
      x = window.innerWidth - popoverWidth - padding;
    }
    if (y + popoverHeight > window.innerHeight - padding) {
      y = window.innerHeight - popoverHeight - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;
    return {
      x: x,
      y: y
    };
  }, [position]);
  var artistDisplay = video.artist && video.artist !== 'Unknown' && video.artist.toLowerCase() !== 'unknown artist' ? video.artist : '';
  return /*#__PURE__*/React.createElement("div", {
    ref: popoverRef,
    className: "video-popover",
    style: {
      position: 'fixed',
      left: adjustedPosition.x,
      top: adjustedPosition.y,
      zIndex: 9999,
      background: 'var(--yt-bg-elevated, #282828)',
      border: '1px solid var(--yt-border-subtle, #3f3f3f)',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      minWidth: '280px',
      maxWidth: '360px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '16px',
      fontWeight: 600,
      color: 'var(--yt-text-primary, #fff)',
      marginBottom: '4px',
      wordBreak: 'break-word'
    }
  }, artistDisplay ? "".concat(artistDisplay, " - ").concat(video.title) : video.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      color: 'var(--yt-text-secondary, #aaa)',
      marginTop: '8px'
    }
  }, "Add to Priority Queue?")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '12px',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onCancel,
    style: {
      padding: '10px 20px',
      background: 'var(--yt-bg-tertiary, #3f3f3f)',
      border: 'none',
      borderRadius: '8px',
      color: 'var(--yt-text-primary, #fff)',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    onMouseEnter: function onMouseEnter(e) {
      return e.currentTarget.style.background = 'var(--yt-bg-hover, #4f4f4f)';
    },
    onMouseLeave: function onMouseLeave(e) {
      return e.currentTarget.style.background = 'var(--yt-bg-tertiary, #3f3f3f)';
    }
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: onAddToPriorityQueue,
    style: {
      padding: '10px 20px',
      background: 'var(--yt-accent-primary, #3ea6ff)',
      border: 'none',
      borderRadius: '8px',
      color: '#000',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    onMouseEnter: function onMouseEnter(e) {
      return e.currentTarget.style.background = 'var(--yt-accent-hover, #65b8ff)';
    },
    onMouseLeave: function onMouseLeave(e) {
      return e.currentTarget.style.background = 'var(--yt-accent-primary, #3ea6ff)';
    }
  }, "Add Video")));
};
var BrowseView = function BrowseView(_ref2) {
  var playlists = _ref2.playlists;
    _ref2.onPlayVideo;
    var onAddToQueue = _ref2.onAddToQueue,
    onAddToPriorityQueue = _ref2.onAddToPriorityQueue,
    onPlayPlaylist = _ref2.onPlayPlaylist,
    currentPlaylist = _ref2.currentPlaylist,
    _ref2$className = _ref2.className,
    className = _ref2$className === void 0 ? '' : _ref2$className;
  var _useState = React.useState('title'),
    _useState2 = _slicedToArray(_useState, 2),
    sortBy = _useState2[0],
    setSortBy = _useState2[1];
  var _useState3 = React.useState(currentPlaylist || null),
    _useState4 = _slicedToArray(_useState3, 2),
    selectedPlaylist = _useState4[0],
    setSelectedPlaylist = _useState4[1];
  var _useState5 = React.useState(null),
    _useState6 = _slicedToArray(_useState5, 2),
    popoverVideo = _useState6[0],
    setPopoverVideo = _useState6[1];
  var _useState7 = React.useState({
      x: 0,
      y: 0
    }),
    _useState8 = _slicedToArray(_useState7, 2),
    popoverPosition = _useState8[0],
    setPopoverPosition = _useState8[1];
  var handleVideoClick = React.useCallback(function (video, event) {
    event.stopPropagation();
    setPopoverVideo(video);
    setPopoverPosition({
      x: event.clientX,
      y: event.clientY
    });
  }, []);
  var handleAddToPriorityQueue = React.useCallback(function () {
    if (popoverVideo && onAddToPriorityQueue) {
      onAddToPriorityQueue(popoverVideo);
    }
    setPopoverVideo(null);
  }, [popoverVideo, onAddToPriorityQueue]);
  var handleClosePopover = React.useCallback(function () {
    setPopoverVideo(null);
  }, []);
  var playlistNames = React.useMemo(function () {
    return Object.keys(playlists).sort();
  }, [playlists]);
  var filteredVideos = React.useMemo(function () {
    var videos = [];
    // Get videos from selected playlist or all
    if (selectedPlaylist) {
      videos = playlists[selectedPlaylist] || [];
    } else {
      videos = Object.values(playlists).flat();
    }
    // Sort
    return _toConsumableArray(videos).sort(function (a, b) {
      switch (sortBy) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'artist':
          return (a.artist || '').localeCompare(b.artist || '');
        case 'playlist':
          return (a.playlist || '').localeCompare(b.playlist || '');
        default:
          return 0;
      }
    });
  }, [playlists, selectedPlaylist, sortBy]);
  var totalVideos = React.useMemo(function () {
    return Object.values(playlists).reduce(function (sum, p) {
      return sum + p.length;
    }, 0);
  }, [playlists]);
  var handlePlayAll = React.useCallback(function () {
    if (selectedPlaylist && playlists[selectedPlaylist]) {
      onPlayPlaylist(selectedPlaylist, playlists[selectedPlaylist]);
    }
  }, [selectedPlaylist, playlists, onPlayPlaylist]);
  if (playlistNames.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "browse-view ".concat(className)
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, /*#__PURE__*/React.createElement("div", {
      className: "empty-state-icon"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "64",
      height: "64",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "empty-state-title"
    }, "No playlists found"), /*#__PURE__*/React.createElement("div", {
      className: "empty-state-description"
    }, "Add some video files to your playlists directory to get started.")));
  }
  // Playlists overview (when no playlist selected)
  if (!selectedPlaylist) {
    return /*#__PURE__*/React.createElement("div", {
      className: "browse-view ".concat(className)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: '24px'
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: '24px',
        fontWeight: 600,
        color: 'var(--yt-text-primary)',
        marginBottom: '8px'
      }
    }, "Your Library"), /*#__PURE__*/React.createElement("p", {
      style: {
        color: 'var(--yt-text-secondary)',
        fontSize: '14px'
      }
    }, totalVideos, " videos in ", playlistNames.length, " playlists")), /*#__PURE__*/React.createElement("div", {
      className: "browse-grid"
    }, playlistNames.map(function (name) {
      var _playlists$name;
      var count = ((_playlists$name = playlists[name]) === null || _playlists$name === void 0 ? void 0 : _playlists$name.length) || 0;
      var isCurrent = currentPlaylist === name;
      return /*#__PURE__*/React.createElement("div", {
        key: name,
        className: "browse-card",
        onClick: function onClick() {
          return setSelectedPlaylist(name);
        },
        style: {
          borderLeft: isCurrent ? '3px solid var(--yt-accent-primary)' : 'none'
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "browse-card-thumbnail"
      }, /*#__PURE__*/React.createElement("svg", {
        width: "48",
        height: "48",
        viewBox: "0 0 24 24",
        fill: "currentColor"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
      }))), /*#__PURE__*/React.createElement("div", {
        className: "browse-card-info"
      }, /*#__PURE__*/React.createElement("div", {
        className: "browse-card-title"
      }, name), /*#__PURE__*/React.createElement("div", {
        className: "browse-card-meta"
      }, count, " video", count !== 1 ? 's' : '', isCurrent && (/*#__PURE__*/React.createElement("span", {
        style: {
          color: 'var(--yt-accent-primary)',
          marginLeft: '8px'
        }
      }, "\u2022 Now playing")))));
    })));
  }
  // Single playlist view
  return /*#__PURE__*/React.createElement("div", {
    className: "browse-view ".concat(className)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '24px',
      marginBottom: '24px',
      paddingBottom: '24px',
      borderBottom: '1px solid var(--yt-border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '160px',
      height: '160px',
      background: 'var(--yt-bg-elevated)',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "64",
    height: "64",
    viewBox: "0 0 24 24",
    fill: "var(--yt-text-muted)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setSelectedPlaylist(null);
    },
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      color: 'var(--yt-text-secondary)',
      fontSize: '12px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      marginBottom: '8px',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
  })), "Back to library"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: '32px',
      fontWeight: 700,
      color: 'var(--yt-text-primary)',
      marginBottom: '8px'
    }
  }, selectedPlaylist), /*#__PURE__*/React.createElement("p", {
    style: {
      color: 'var(--yt-text-secondary)',
      fontSize: '14px',
      marginBottom: '16px'
    }
  }, filteredVideos.length, " video", filteredVideos.length !== 1 ? 's' : ''), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: handlePlayAll,
    className: "control-btn primary",
    style: {
      width: 'auto',
      padding: '12px 32px',
      borderRadius: '24px',
      fontWeight: 500,
      fontSize: '14px'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "currentColor",
    style: {
      marginRight: '8px'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 5v14l11-7z"
  })), "Play All"), /*#__PURE__*/React.createElement("select", {
    value: sortBy,
    onChange: function onChange(e) {
      return setSortBy(e.target.value);
    },
    style: {
      padding: '12px 16px',
      background: 'var(--yt-bg-elevated)',
      border: '1px solid var(--yt-border-subtle)',
      borderRadius: '8px',
      color: 'var(--yt-text-primary)',
      fontSize: '14px',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "title"
  }, "Sort by Title"), /*#__PURE__*/React.createElement("option", {
    value: "artist"
  }, "Sort by Artist"))))), /*#__PURE__*/React.createElement("div", {
    className: "queue-list"
  }, filteredVideos.map(function (video, index) {
    return /*#__PURE__*/React.createElement("div", {
      key: video.id || index,
      className: "queue-item",
      onClick: function onClick(e) {
        return handleVideoClick(video, e);
      },
      style: {
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "queue-item-index"
    }, index + 1), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-thumbnail"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "20",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M8 5v14l11-7z"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-info"
    }, /*#__PURE__*/React.createElement("div", {
      className: "queue-item-title"
    }, video.title), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-artist"
    }, video.artist || 'Unknown Artist')), /*#__PURE__*/React.createElement("div", {
      className: "queue-item-actions"
    }, /*#__PURE__*/React.createElement("button", {
      className: "queue-action-btn",
      onClick: function onClick(e) {
        e.stopPropagation();
        onAddToQueue(video);
      },
      title: "Add to queue"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
    })))));
  })), popoverVideo && (/*#__PURE__*/React.createElement(VideoPopover, {
    video: popoverVideo,
    position: popoverPosition,
    onAddToPriorityQueue: handleAddToPriorityQueue,
    onCancel: handleClosePopover
  })));
};

/**
 * Fuse.js v7.1.0 - Lightweight fuzzy-search (http://fusejs.io)
 *
 * Copyright (c) 2025 Kiro Risk (http://kiro.me)
 * All Rights Reserved. Apache Software License 2.0
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

function isArray(value) {
  return !Array.isArray
    ? getTag(value) === '[object Array]'
    : Array.isArray(value)
}

// Adapted from: https://github.com/lodash/lodash/blob/master/.internal/baseToString.js
const INFINITY = 1 / 0;
function baseToString(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value
  }
  let result = value + '';
  return result == '0' && 1 / value == -INFINITY ? '-0' : result
}

function toString(value) {
  return value == null ? '' : baseToString(value)
}

function isString(value) {
  return typeof value === 'string'
}

function isNumber(value) {
  return typeof value === 'number'
}

// Adapted from: https://github.com/lodash/lodash/blob/master/isBoolean.js
function isBoolean(value) {
  return (
    value === true ||
    value === false ||
    (isObjectLike(value) && getTag(value) == '[object Boolean]')
  )
}

function isObject(value) {
  return typeof value === 'object'
}

// Checks if `value` is object-like.
function isObjectLike(value) {
  return isObject(value) && value !== null
}

function isDefined(value) {
  return value !== undefined && value !== null
}

function isBlank(value) {
  return !value.trim().length
}

// Gets the `toStringTag` of `value`.
// Adapted from: https://github.com/lodash/lodash/blob/master/.internal/getTag.js
function getTag(value) {
  return value == null
    ? value === undefined
      ? '[object Undefined]'
      : '[object Null]'
    : Object.prototype.toString.call(value)
}

const EXTENDED_SEARCH_UNAVAILABLE = 'Extended search is not available';

const INCORRECT_INDEX_TYPE = "Incorrect 'index' type";

const LOGICAL_SEARCH_INVALID_QUERY_FOR_KEY = (key) =>
  `Invalid value for key ${key}`;

const PATTERN_LENGTH_TOO_LARGE = (max) =>
  `Pattern length exceeds max of ${max}.`;

const MISSING_KEY_PROPERTY = (name) => `Missing ${name} property in key`;

const INVALID_KEY_WEIGHT_VALUE = (key) =>
  `Property 'weight' in key '${key}' must be a positive integer`;

const hasOwn = Object.prototype.hasOwnProperty;

class KeyStore {
  constructor(keys) {
    this._keys = [];
    this._keyMap = {};

    let totalWeight = 0;

    keys.forEach((key) => {
      let obj = createKey(key);

      this._keys.push(obj);
      this._keyMap[obj.id] = obj;

      totalWeight += obj.weight;
    });

    // Normalize weights so that their sum is equal to 1
    this._keys.forEach((key) => {
      key.weight /= totalWeight;
    });
  }
  get(keyId) {
    return this._keyMap[keyId]
  }
  keys() {
    return this._keys
  }
  toJSON() {
    return JSON.stringify(this._keys)
  }
}

function createKey(key) {
  let path = null;
  let id = null;
  let src = null;
  let weight = 1;
  let getFn = null;

  if (isString(key) || isArray(key)) {
    src = key;
    path = createKeyPath(key);
    id = createKeyId(key);
  } else {
    if (!hasOwn.call(key, 'name')) {
      throw new Error(MISSING_KEY_PROPERTY('name'))
    }

    const name = key.name;
    src = name;

    if (hasOwn.call(key, 'weight')) {
      weight = key.weight;

      if (weight <= 0) {
        throw new Error(INVALID_KEY_WEIGHT_VALUE(name))
      }
    }

    path = createKeyPath(name);
    id = createKeyId(name);
    getFn = key.getFn;
  }

  return { path, id, weight, src, getFn }
}

function createKeyPath(key) {
  return isArray(key) ? key : key.split('.')
}

function createKeyId(key) {
  return isArray(key) ? key.join('.') : key
}

function get(obj, path) {
  let list = [];
  let arr = false;

  const deepGet = (obj, path, index) => {
    if (!isDefined(obj)) {
      return
    }
    if (!path[index]) {
      // If there's no path left, we've arrived at the object we care about.
      list.push(obj);
    } else {
      let key = path[index];

      const value = obj[key];

      if (!isDefined(value)) {
        return
      }

      // If we're at the last value in the path, and if it's a string/number/bool,
      // add it to the list
      if (
        index === path.length - 1 &&
        (isString(value) || isNumber(value) || isBoolean(value))
      ) {
        list.push(toString(value));
      } else if (isArray(value)) {
        arr = true;
        // Search each item in the array.
        for (let i = 0, len = value.length; i < len; i += 1) {
          deepGet(value[i], path, index + 1);
        }
      } else if (path.length) {
        // An object. Recurse further.
        deepGet(value, path, index + 1);
      }
    }
  };

  // Backwards compatibility (since path used to be a string)
  deepGet(obj, isString(path) ? path.split('.') : path, 0);

  return arr ? list : list[0]
}

const MatchOptions = {
  // Whether the matches should be included in the result set. When `true`, each record in the result
  // set will include the indices of the matched characters.
  // These can consequently be used for highlighting purposes.
  includeMatches: false,
  // When `true`, the matching function will continue to the end of a search pattern even if
  // a perfect match has already been located in the string.
  findAllMatches: false,
  // Minimum number of characters that must be matched before a result is considered a match
  minMatchCharLength: 1
};

const BasicOptions = {
  // When `true`, the algorithm continues searching to the end of the input even if a perfect
  // match is found before the end of the same input.
  isCaseSensitive: false,
  // When `true`, the algorithm will ignore diacritics (accents) in comparisons
  ignoreDiacritics: false,
  // When true, the matching function will continue to the end of a search pattern even if
  includeScore: false,
  // List of properties that will be searched. This also supports nested properties.
  keys: [],
  // Whether to sort the result list, by score
  shouldSort: true,
  // Default sort function: sort by ascending score, ascending index
  sortFn: (a, b) =>
    a.score === b.score ? (a.idx < b.idx ? -1 : 1) : a.score < b.score ? -1 : 1
};

const FuzzyOptions = {
  // Approximately where in the text is the pattern expected to be found?
  location: 0,
  // At what point does the match algorithm give up. A threshold of '0.0' requires a perfect match
  // (of both letters and location), a threshold of '1.0' would match anything.
  threshold: 0.6,
  // Determines how close the match must be to the fuzzy location (specified above).
  // An exact letter match which is 'distance' characters away from the fuzzy location
  // would score as a complete mismatch. A distance of '0' requires the match be at
  // the exact location specified, a threshold of '1000' would require a perfect match
  // to be within 800 characters of the fuzzy location to be found using a 0.8 threshold.
  distance: 100
};

const AdvancedOptions = {
  // When `true`, it enables the use of unix-like search commands
  useExtendedSearch: false,
  // The get function to use when fetching an object's properties.
  // The default will search nested paths *ie foo.bar.baz*
  getFn: get,
  // When `true`, search will ignore `location` and `distance`, so it won't matter
  // where in the string the pattern appears.
  // More info: https://fusejs.io/concepts/scoring-theory.html#fuzziness-score
  ignoreLocation: false,
  // When `true`, the calculation for the relevance score (used for sorting) will
  // ignore the field-length norm.
  // More info: https://fusejs.io/concepts/scoring-theory.html#field-length-norm
  ignoreFieldNorm: false,
  // The weight to determine how much field length norm effects scoring.
  fieldNormWeight: 1
};

var Config = {
  ...BasicOptions,
  ...MatchOptions,
  ...FuzzyOptions,
  ...AdvancedOptions
};

const SPACE = /[^ ]+/g;

// Field-length norm: the shorter the field, the higher the weight.
// Set to 3 decimals to reduce index size.
function norm(weight = 1, mantissa = 3) {
  const cache = new Map();
  const m = Math.pow(10, mantissa);

  return {
    get(value) {
      const numTokens = value.match(SPACE).length;

      if (cache.has(numTokens)) {
        return cache.get(numTokens)
      }

      // Default function is 1/sqrt(x), weight makes that variable
      const norm = 1 / Math.pow(numTokens, 0.5 * weight);

      // In place of `toFixed(mantissa)`, for faster computation
      const n = parseFloat(Math.round(norm * m) / m);

      cache.set(numTokens, n);

      return n
    },
    clear() {
      cache.clear();
    }
  }
}

class FuseIndex {
  constructor({
    getFn = Config.getFn,
    fieldNormWeight = Config.fieldNormWeight
  } = {}) {
    this.norm = norm(fieldNormWeight, 3);
    this.getFn = getFn;
    this.isCreated = false;

    this.setIndexRecords();
  }
  setSources(docs = []) {
    this.docs = docs;
  }
  setIndexRecords(records = []) {
    this.records = records;
  }
  setKeys(keys = []) {
    this.keys = keys;
    this._keysMap = {};
    keys.forEach((key, idx) => {
      this._keysMap[key.id] = idx;
    });
  }
  create() {
    if (this.isCreated || !this.docs.length) {
      return
    }

    this.isCreated = true;

    // List is Array<String>
    if (isString(this.docs[0])) {
      this.docs.forEach((doc, docIndex) => {
        this._addString(doc, docIndex);
      });
    } else {
      // List is Array<Object>
      this.docs.forEach((doc, docIndex) => {
        this._addObject(doc, docIndex);
      });
    }

    this.norm.clear();
  }
  // Adds a doc to the end of the index
  add(doc) {
    const idx = this.size();

    if (isString(doc)) {
      this._addString(doc, idx);
    } else {
      this._addObject(doc, idx);
    }
  }
  // Removes the doc at the specified index of the index
  removeAt(idx) {
    this.records.splice(idx, 1);

    // Change ref index of every subsquent doc
    for (let i = idx, len = this.size(); i < len; i += 1) {
      this.records[i].i -= 1;
    }
  }
  getValueForItemAtKeyId(item, keyId) {
    return item[this._keysMap[keyId]]
  }
  size() {
    return this.records.length
  }
  _addString(doc, docIndex) {
    if (!isDefined(doc) || isBlank(doc)) {
      return
    }

    let record = {
      v: doc,
      i: docIndex,
      n: this.norm.get(doc)
    };

    this.records.push(record);
  }
  _addObject(doc, docIndex) {
    let record = { i: docIndex, $: {} };

    // Iterate over every key (i.e, path), and fetch the value at that key
    this.keys.forEach((key, keyIndex) => {
      let value = key.getFn ? key.getFn(doc) : this.getFn(doc, key.path);

      if (!isDefined(value)) {
        return
      }

      if (isArray(value)) {
        let subRecords = [];
        const stack = [{ nestedArrIndex: -1, value }];

        while (stack.length) {
          const { nestedArrIndex, value } = stack.pop();

          if (!isDefined(value)) {
            continue
          }

          if (isString(value) && !isBlank(value)) {
            let subRecord = {
              v: value,
              i: nestedArrIndex,
              n: this.norm.get(value)
            };

            subRecords.push(subRecord);
          } else if (isArray(value)) {
            value.forEach((item, k) => {
              stack.push({
                nestedArrIndex: k,
                value: item
              });
            });
          } else ;
        }
        record.$[keyIndex] = subRecords;
      } else if (isString(value) && !isBlank(value)) {
        let subRecord = {
          v: value,
          n: this.norm.get(value)
        };

        record.$[keyIndex] = subRecord;
      }
    });

    this.records.push(record);
  }
  toJSON() {
    return {
      keys: this.keys,
      records: this.records
    }
  }
}

function createIndex(
  keys,
  docs,
  { getFn = Config.getFn, fieldNormWeight = Config.fieldNormWeight } = {}
) {
  const myIndex = new FuseIndex({ getFn, fieldNormWeight });
  myIndex.setKeys(keys.map(createKey));
  myIndex.setSources(docs);
  myIndex.create();
  return myIndex
}

function parseIndex(
  data,
  { getFn = Config.getFn, fieldNormWeight = Config.fieldNormWeight } = {}
) {
  const { keys, records } = data;
  const myIndex = new FuseIndex({ getFn, fieldNormWeight });
  myIndex.setKeys(keys);
  myIndex.setIndexRecords(records);
  return myIndex
}

function computeScore$1(
  pattern,
  {
    errors = 0,
    currentLocation = 0,
    expectedLocation = 0,
    distance = Config.distance,
    ignoreLocation = Config.ignoreLocation
  } = {}
) {
  const accuracy = errors / pattern.length;

  if (ignoreLocation) {
    return accuracy
  }

  const proximity = Math.abs(expectedLocation - currentLocation);

  if (!distance) {
    // Dodge divide by zero error.
    return proximity ? 1.0 : accuracy
  }

  return accuracy + proximity / distance
}

function convertMaskToIndices(
  matchmask = [],
  minMatchCharLength = Config.minMatchCharLength
) {
  let indices = [];
  let start = -1;
  let end = -1;
  let i = 0;

  for (let len = matchmask.length; i < len; i += 1) {
    let match = matchmask[i];
    if (match && start === -1) {
      start = i;
    } else if (!match && start !== -1) {
      end = i - 1;
      if (end - start + 1 >= minMatchCharLength) {
        indices.push([start, end]);
      }
      start = -1;
    }
  }

  // (i-1 - start) + 1 => i - start
  if (matchmask[i - 1] && i - start >= minMatchCharLength) {
    indices.push([start, i - 1]);
  }

  return indices
}

// Machine word size
const MAX_BITS = 32;

function search(
  text,
  pattern,
  patternAlphabet,
  {
    location = Config.location,
    distance = Config.distance,
    threshold = Config.threshold,
    findAllMatches = Config.findAllMatches,
    minMatchCharLength = Config.minMatchCharLength,
    includeMatches = Config.includeMatches,
    ignoreLocation = Config.ignoreLocation
  } = {}
) {
  if (pattern.length > MAX_BITS) {
    throw new Error(PATTERN_LENGTH_TOO_LARGE(MAX_BITS))
  }

  const patternLen = pattern.length;
  // Set starting location at beginning text and initialize the alphabet.
  const textLen = text.length;
  // Handle the case when location > text.length
  const expectedLocation = Math.max(0, Math.min(location, textLen));
  // Highest score beyond which we give up.
  let currentThreshold = threshold;
  // Is there a nearby exact match? (speedup)
  let bestLocation = expectedLocation;

  // Performance: only computer matches when the minMatchCharLength > 1
  // OR if `includeMatches` is true.
  const computeMatches = minMatchCharLength > 1 || includeMatches;
  // A mask of the matches, used for building the indices
  const matchMask = computeMatches ? Array(textLen) : [];

  let index;

  // Get all exact matches, here for speed up
  while ((index = text.indexOf(pattern, bestLocation)) > -1) {
    let score = computeScore$1(pattern, {
      currentLocation: index,
      expectedLocation,
      distance,
      ignoreLocation
    });

    currentThreshold = Math.min(score, currentThreshold);
    bestLocation = index + patternLen;

    if (computeMatches) {
      let i = 0;
      while (i < patternLen) {
        matchMask[index + i] = 1;
        i += 1;
      }
    }
  }

  // Reset the best location
  bestLocation = -1;

  let lastBitArr = [];
  let finalScore = 1;
  let binMax = patternLen + textLen;

  const mask = 1 << (patternLen - 1);

  for (let i = 0; i < patternLen; i += 1) {
    // Scan for the best match; each iteration allows for one more error.
    // Run a binary search to determine how far from the match location we can stray
    // at this error level.
    let binMin = 0;
    let binMid = binMax;

    while (binMin < binMid) {
      const score = computeScore$1(pattern, {
        errors: i,
        currentLocation: expectedLocation + binMid,
        expectedLocation,
        distance,
        ignoreLocation
      });

      if (score <= currentThreshold) {
        binMin = binMid;
      } else {
        binMax = binMid;
      }

      binMid = Math.floor((binMax - binMin) / 2 + binMin);
    }

    // Use the result from this iteration as the maximum for the next.
    binMax = binMid;

    let start = Math.max(1, expectedLocation - binMid + 1);
    let finish = findAllMatches
      ? textLen
      : Math.min(expectedLocation + binMid, textLen) + patternLen;

    // Initialize the bit array
    let bitArr = Array(finish + 2);

    bitArr[finish + 1] = (1 << i) - 1;

    for (let j = finish; j >= start; j -= 1) {
      let currentLocation = j - 1;
      let charMatch = patternAlphabet[text.charAt(currentLocation)];

      if (computeMatches) {
        // Speed up: quick bool to int conversion (i.e, `charMatch ? 1 : 0`)
        matchMask[currentLocation] = +!!charMatch;
      }

      // First pass: exact match
      bitArr[j] = ((bitArr[j + 1] << 1) | 1) & charMatch;

      // Subsequent passes: fuzzy match
      if (i) {
        bitArr[j] |=
          ((lastBitArr[j + 1] | lastBitArr[j]) << 1) | 1 | lastBitArr[j + 1];
      }

      if (bitArr[j] & mask) {
        finalScore = computeScore$1(pattern, {
          errors: i,
          currentLocation,
          expectedLocation,
          distance,
          ignoreLocation
        });

        // This match will almost certainly be better than any existing match.
        // But check anyway.
        if (finalScore <= currentThreshold) {
          // Indeed it is
          currentThreshold = finalScore;
          bestLocation = currentLocation;

          // Already passed `loc`, downhill from here on in.
          if (bestLocation <= expectedLocation) {
            break
          }

          // When passing `bestLocation`, don't exceed our current distance from `expectedLocation`.
          start = Math.max(1, 2 * expectedLocation - bestLocation);
        }
      }
    }

    // No hope for a (better) match at greater error levels.
    const score = computeScore$1(pattern, {
      errors: i + 1,
      currentLocation: expectedLocation,
      expectedLocation,
      distance,
      ignoreLocation
    });

    if (score > currentThreshold) {
      break
    }

    lastBitArr = bitArr;
  }

  const result = {
    isMatch: bestLocation >= 0,
    // Count exact matches (those with a score of 0) to be "almost" exact
    score: Math.max(0.001, finalScore)
  };

  if (computeMatches) {
    const indices = convertMaskToIndices(matchMask, minMatchCharLength);
    if (!indices.length) {
      result.isMatch = false;
    } else if (includeMatches) {
      result.indices = indices;
    }
  }

  return result
}

function createPatternAlphabet(pattern) {
  let mask = {};

  for (let i = 0, len = pattern.length; i < len; i += 1) {
    const char = pattern.charAt(i);
    mask[char] = (mask[char] || 0) | (1 << (len - i - 1));
  }

  return mask
}

const stripDiacritics = String.prototype.normalize
    ? ((str) => str.normalize('NFD').replace(/[\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u08D3-\u08E1\u08E3-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7\u09E2\u09E3\u09FE\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2\u0AE3\u0AFA-\u0AFF\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B62\u0B63\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0C00-\u0C04\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CE2\u0CE3\u0D00-\u0D03\u0D3B\u0D3C\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62\u0D63\u0D82\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F3E\u0F3F\u0F71-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4-\u17D3\u17DD\u180B-\u180D\u1885\u1886\u18A9\u1920-\u192B\u1930-\u193B\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F\u1AB0-\u1ABE\u1B00-\u1B04\u1B34-\u1B44\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BE6-\u1BF3\u1C24-\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF2-\u1CF4\u1CF7-\u1CF9\u1DC0-\u1DF9\u1DFB-\u1DFF\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\uA66F-\uA672\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA880\uA881\uA8B4-\uA8C5\uA8E0-\uA8F1\uA8FF\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9E5\uAA29-\uAA36\uAA43\uAA4C\uAA4D\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5\uAAF6\uABE3-\uABEA\uABEC\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F]/g, ''))
    : ((str) => str);

class BitapSearch {
  constructor(
    pattern,
    {
      location = Config.location,
      threshold = Config.threshold,
      distance = Config.distance,
      includeMatches = Config.includeMatches,
      findAllMatches = Config.findAllMatches,
      minMatchCharLength = Config.minMatchCharLength,
      isCaseSensitive = Config.isCaseSensitive,
      ignoreDiacritics = Config.ignoreDiacritics,
      ignoreLocation = Config.ignoreLocation
    } = {}
  ) {
    this.options = {
      location,
      threshold,
      distance,
      includeMatches,
      findAllMatches,
      minMatchCharLength,
      isCaseSensitive,
      ignoreDiacritics,
      ignoreLocation
    };

    pattern = isCaseSensitive ? pattern : pattern.toLowerCase();
    pattern = ignoreDiacritics ? stripDiacritics(pattern) : pattern;
    this.pattern = pattern;

    this.chunks = [];

    if (!this.pattern.length) {
      return
    }

    const addChunk = (pattern, startIndex) => {
      this.chunks.push({
        pattern,
        alphabet: createPatternAlphabet(pattern),
        startIndex
      });
    };

    const len = this.pattern.length;

    if (len > MAX_BITS) {
      let i = 0;
      const remainder = len % MAX_BITS;
      const end = len - remainder;

      while (i < end) {
        addChunk(this.pattern.substr(i, MAX_BITS), i);
        i += MAX_BITS;
      }

      if (remainder) {
        const startIndex = len - MAX_BITS;
        addChunk(this.pattern.substr(startIndex), startIndex);
      }
    } else {
      addChunk(this.pattern, 0);
    }
  }

  searchIn(text) {
    const { isCaseSensitive, ignoreDiacritics, includeMatches } = this.options;

    text = isCaseSensitive ? text : text.toLowerCase();
    text = ignoreDiacritics ? stripDiacritics(text) : text;

    // Exact match
    if (this.pattern === text) {
      let result = {
        isMatch: true,
        score: 0
      };

      if (includeMatches) {
        result.indices = [[0, text.length - 1]];
      }

      return result
    }

    // Otherwise, use Bitap algorithm
    const {
      location,
      distance,
      threshold,
      findAllMatches,
      minMatchCharLength,
      ignoreLocation
    } = this.options;

    let allIndices = [];
    let totalScore = 0;
    let hasMatches = false;

    this.chunks.forEach(({ pattern, alphabet, startIndex }) => {
      const { isMatch, score, indices } = search(text, pattern, alphabet, {
        location: location + startIndex,
        distance,
        threshold,
        findAllMatches,
        minMatchCharLength,
        includeMatches,
        ignoreLocation
      });

      if (isMatch) {
        hasMatches = true;
      }

      totalScore += score;

      if (isMatch && indices) {
        allIndices = [...allIndices, ...indices];
      }
    });

    let result = {
      isMatch: hasMatches,
      score: hasMatches ? totalScore / this.chunks.length : 1
    };

    if (hasMatches && includeMatches) {
      result.indices = allIndices;
    }

    return result
  }
}

class BaseMatch {
  constructor(pattern) {
    this.pattern = pattern;
  }
  static isMultiMatch(pattern) {
    return getMatch(pattern, this.multiRegex)
  }
  static isSingleMatch(pattern) {
    return getMatch(pattern, this.singleRegex)
  }
  search(/*text*/) {}
}

function getMatch(pattern, exp) {
  const matches = pattern.match(exp);
  return matches ? matches[1] : null
}

// Token: 'file

class ExactMatch extends BaseMatch {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'exact'
  }
  static get multiRegex() {
    return /^="(.*)"$/
  }
  static get singleRegex() {
    return /^=(.*)$/
  }
  search(text) {
    const isMatch = text === this.pattern;

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      indices: [0, this.pattern.length - 1]
    }
  }
}

// Token: !fire

class InverseExactMatch extends BaseMatch {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'inverse-exact'
  }
  static get multiRegex() {
    return /^!"(.*)"$/
  }
  static get singleRegex() {
    return /^!(.*)$/
  }
  search(text) {
    const index = text.indexOf(this.pattern);
    const isMatch = index === -1;

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      indices: [0, text.length - 1]
    }
  }
}

// Token: ^file

class PrefixExactMatch extends BaseMatch {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'prefix-exact'
  }
  static get multiRegex() {
    return /^\^"(.*)"$/
  }
  static get singleRegex() {
    return /^\^(.*)$/
  }
  search(text) {
    const isMatch = text.startsWith(this.pattern);

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      indices: [0, this.pattern.length - 1]
    }
  }
}

// Token: !^fire

class InversePrefixExactMatch extends BaseMatch {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'inverse-prefix-exact'
  }
  static get multiRegex() {
    return /^!\^"(.*)"$/
  }
  static get singleRegex() {
    return /^!\^(.*)$/
  }
  search(text) {
    const isMatch = !text.startsWith(this.pattern);

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      indices: [0, text.length - 1]
    }
  }
}

// Token: .file$

class SuffixExactMatch extends BaseMatch {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'suffix-exact'
  }
  static get multiRegex() {
    return /^"(.*)"\$$/
  }
  static get singleRegex() {
    return /^(.*)\$$/
  }
  search(text) {
    const isMatch = text.endsWith(this.pattern);

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      indices: [text.length - this.pattern.length, text.length - 1]
    }
  }
}

// Token: !.file$

class InverseSuffixExactMatch extends BaseMatch {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'inverse-suffix-exact'
  }
  static get multiRegex() {
    return /^!"(.*)"\$$/
  }
  static get singleRegex() {
    return /^!(.*)\$$/
  }
  search(text) {
    const isMatch = !text.endsWith(this.pattern);
    return {
      isMatch,
      score: isMatch ? 0 : 1,
      indices: [0, text.length - 1]
    }
  }
}

class FuzzyMatch extends BaseMatch {
  constructor(
    pattern,
    {
      location = Config.location,
      threshold = Config.threshold,
      distance = Config.distance,
      includeMatches = Config.includeMatches,
      findAllMatches = Config.findAllMatches,
      minMatchCharLength = Config.minMatchCharLength,
      isCaseSensitive = Config.isCaseSensitive,
      ignoreDiacritics = Config.ignoreDiacritics,
      ignoreLocation = Config.ignoreLocation
    } = {}
  ) {
    super(pattern);
    this._bitapSearch = new BitapSearch(pattern, {
      location,
      threshold,
      distance,
      includeMatches,
      findAllMatches,
      minMatchCharLength,
      isCaseSensitive,
      ignoreDiacritics,
      ignoreLocation
    });
  }
  static get type() {
    return 'fuzzy'
  }
  static get multiRegex() {
    return /^"(.*)"$/
  }
  static get singleRegex() {
    return /^(.*)$/
  }
  search(text) {
    return this._bitapSearch.searchIn(text)
  }
}

// Token: 'file

class IncludeMatch extends BaseMatch {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'include'
  }
  static get multiRegex() {
    return /^'"(.*)"$/
  }
  static get singleRegex() {
    return /^'(.*)$/
  }
  search(text) {
    let location = 0;
    let index;

    const indices = [];
    const patternLen = this.pattern.length;

    // Get all exact matches
    while ((index = text.indexOf(this.pattern, location)) > -1) {
      location = index + patternLen;
      indices.push([index, location - 1]);
    }

    const isMatch = !!indices.length;

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      indices
    }
  }
}

// ❗Order is important. DO NOT CHANGE.
const searchers = [
  ExactMatch,
  IncludeMatch,
  PrefixExactMatch,
  InversePrefixExactMatch,
  InverseSuffixExactMatch,
  SuffixExactMatch,
  InverseExactMatch,
  FuzzyMatch
];

const searchersLen = searchers.length;

// Regex to split by spaces, but keep anything in quotes together
const SPACE_RE = / +(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/;
const OR_TOKEN = '|';

// Return a 2D array representation of the query, for simpler parsing.
// Example:
// "^core go$ | rb$ | py$ xy$" => [["^core", "go$"], ["rb$"], ["py$", "xy$"]]
function parseQuery(pattern, options = {}) {
  return pattern.split(OR_TOKEN).map((item) => {
    let query = item
      .trim()
      .split(SPACE_RE)
      .filter((item) => item && !!item.trim());

    let results = [];
    for (let i = 0, len = query.length; i < len; i += 1) {
      const queryItem = query[i];

      // 1. Handle multiple query match (i.e, once that are quoted, like `"hello world"`)
      let found = false;
      let idx = -1;
      while (!found && ++idx < searchersLen) {
        const searcher = searchers[idx];
        let token = searcher.isMultiMatch(queryItem);
        if (token) {
          results.push(new searcher(token, options));
          found = true;
        }
      }

      if (found) {
        continue
      }

      // 2. Handle single query matches (i.e, once that are *not* quoted)
      idx = -1;
      while (++idx < searchersLen) {
        const searcher = searchers[idx];
        let token = searcher.isSingleMatch(queryItem);
        if (token) {
          results.push(new searcher(token, options));
          break
        }
      }
    }

    return results
  })
}

// These extended matchers can return an array of matches, as opposed
// to a singl match
const MultiMatchSet = new Set([FuzzyMatch.type, IncludeMatch.type]);

/**
 * Command-like searching
 * ======================
 *
 * Given multiple search terms delimited by spaces.e.g. `^jscript .python$ ruby !java`,
 * search in a given text.
 *
 * Search syntax:
 *
 * | Token       | Match type                 | Description                            |
 * | ----------- | -------------------------- | -------------------------------------- |
 * | `jscript`   | fuzzy-match                | Items that fuzzy match `jscript`       |
 * | `=scheme`   | exact-match                | Items that are `scheme`                |
 * | `'python`   | include-match              | Items that include `python`            |
 * | `!ruby`     | inverse-exact-match        | Items that do not include `ruby`       |
 * | `^java`     | prefix-exact-match         | Items that start with `java`           |
 * | `!^earlang` | inverse-prefix-exact-match | Items that do not start with `earlang` |
 * | `.js$`      | suffix-exact-match         | Items that end with `.js`              |
 * | `!.go$`     | inverse-suffix-exact-match | Items that do not end with `.go`       |
 *
 * A single pipe character acts as an OR operator. For example, the following
 * query matches entries that start with `core` and end with either`go`, `rb`,
 * or`py`.
 *
 * ```
 * ^core go$ | rb$ | py$
 * ```
 */
class ExtendedSearch {
  constructor(
    pattern,
    {
      isCaseSensitive = Config.isCaseSensitive,
      ignoreDiacritics = Config.ignoreDiacritics,
      includeMatches = Config.includeMatches,
      minMatchCharLength = Config.minMatchCharLength,
      ignoreLocation = Config.ignoreLocation,
      findAllMatches = Config.findAllMatches,
      location = Config.location,
      threshold = Config.threshold,
      distance = Config.distance
    } = {}
  ) {
    this.query = null;
    this.options = {
      isCaseSensitive,
      ignoreDiacritics,
      includeMatches,
      minMatchCharLength,
      findAllMatches,
      ignoreLocation,
      location,
      threshold,
      distance
    };

    pattern = isCaseSensitive ? pattern : pattern.toLowerCase();
    pattern = ignoreDiacritics ? stripDiacritics(pattern) : pattern;
    this.pattern = pattern;
    this.query = parseQuery(this.pattern, this.options);
  }

  static condition(_, options) {
    return options.useExtendedSearch
  }

  searchIn(text) {
    const query = this.query;

    if (!query) {
      return {
        isMatch: false,
        score: 1
      }
    }

    const { includeMatches, isCaseSensitive, ignoreDiacritics } = this.options;

    text = isCaseSensitive ? text : text.toLowerCase();
    text = ignoreDiacritics ? stripDiacritics(text) : text;

    let numMatches = 0;
    let allIndices = [];
    let totalScore = 0;

    // ORs
    for (let i = 0, qLen = query.length; i < qLen; i += 1) {
      const searchers = query[i];

      // Reset indices
      allIndices.length = 0;
      numMatches = 0;

      // ANDs
      for (let j = 0, pLen = searchers.length; j < pLen; j += 1) {
        const searcher = searchers[j];
        const { isMatch, indices, score } = searcher.search(text);

        if (isMatch) {
          numMatches += 1;
          totalScore += score;
          if (includeMatches) {
            const type = searcher.constructor.type;
            if (MultiMatchSet.has(type)) {
              allIndices = [...allIndices, ...indices];
            } else {
              allIndices.push(indices);
            }
          }
        } else {
          totalScore = 0;
          numMatches = 0;
          allIndices.length = 0;
          break
        }
      }

      // OR condition, so if TRUE, return
      if (numMatches) {
        let result = {
          isMatch: true,
          score: totalScore / numMatches
        };

        if (includeMatches) {
          result.indices = allIndices;
        }

        return result
      }
    }

    // Nothing was matched
    return {
      isMatch: false,
      score: 1
    }
  }
}

const registeredSearchers = [];

function register(...args) {
  registeredSearchers.push(...args);
}

function createSearcher(pattern, options) {
  for (let i = 0, len = registeredSearchers.length; i < len; i += 1) {
    let searcherClass = registeredSearchers[i];
    if (searcherClass.condition(pattern, options)) {
      return new searcherClass(pattern, options)
    }
  }

  return new BitapSearch(pattern, options)
}

const LogicalOperator = {
  AND: '$and',
  OR: '$or'
};

const KeyType = {
  PATH: '$path',
  PATTERN: '$val'
};

const isExpression = (query) =>
  !!(query[LogicalOperator.AND] || query[LogicalOperator.OR]);

const isPath = (query) => !!query[KeyType.PATH];

const isLeaf = (query) =>
  !isArray(query) && isObject(query) && !isExpression(query);

const convertToExplicit = (query) => ({
  [LogicalOperator.AND]: Object.keys(query).map((key) => ({
    [key]: query[key]
  }))
});

// When `auto` is `true`, the parse function will infer and initialize and add
// the appropriate `Searcher` instance
function parse(query, options, { auto = true } = {}) {
  const next = (query) => {
    let keys = Object.keys(query);

    const isQueryPath = isPath(query);

    if (!isQueryPath && keys.length > 1 && !isExpression(query)) {
      return next(convertToExplicit(query))
    }

    if (isLeaf(query)) {
      const key = isQueryPath ? query[KeyType.PATH] : keys[0];

      const pattern = isQueryPath ? query[KeyType.PATTERN] : query[key];

      if (!isString(pattern)) {
        throw new Error(LOGICAL_SEARCH_INVALID_QUERY_FOR_KEY(key))
      }

      const obj = {
        keyId: createKeyId(key),
        pattern
      };

      if (auto) {
        obj.searcher = createSearcher(pattern, options);
      }

      return obj
    }

    let node = {
      children: [],
      operator: keys[0]
    };

    keys.forEach((key) => {
      const value = query[key];

      if (isArray(value)) {
        value.forEach((item) => {
          node.children.push(next(item));
        });
      }
    });

    return node
  };

  if (!isExpression(query)) {
    query = convertToExplicit(query);
  }

  return next(query)
}

// Practical scoring function
function computeScore(
  results,
  { ignoreFieldNorm = Config.ignoreFieldNorm }
) {
  results.forEach((result) => {
    let totalScore = 1;

    result.matches.forEach(({ key, norm, score }) => {
      const weight = key ? key.weight : null;

      totalScore *= Math.pow(
        score === 0 && weight ? Number.EPSILON : score,
        (weight || 1) * (ignoreFieldNorm ? 1 : norm)
      );
    });

    result.score = totalScore;
  });
}

function transformMatches(result, data) {
  const matches = result.matches;
  data.matches = [];

  if (!isDefined(matches)) {
    return
  }

  matches.forEach((match) => {
    if (!isDefined(match.indices) || !match.indices.length) {
      return
    }

    const { indices, value } = match;

    let obj = {
      indices,
      value
    };

    if (match.key) {
      obj.key = match.key.src;
    }

    if (match.idx > -1) {
      obj.refIndex = match.idx;
    }

    data.matches.push(obj);
  });
}

function transformScore(result, data) {
  data.score = result.score;
}

function format(
  results,
  docs,
  {
    includeMatches = Config.includeMatches,
    includeScore = Config.includeScore
  } = {}
) {
  const transformers = [];

  if (includeMatches) transformers.push(transformMatches);
  if (includeScore) transformers.push(transformScore);

  return results.map((result) => {
    const { idx } = result;

    const data = {
      item: docs[idx],
      refIndex: idx
    };

    if (transformers.length) {
      transformers.forEach((transformer) => {
        transformer(result, data);
      });
    }

    return data
  })
}

class Fuse {
  constructor(docs, options = {}, index) {
    this.options = { ...Config, ...options };

    if (
      this.options.useExtendedSearch &&
      !true
    ) {
      throw new Error(EXTENDED_SEARCH_UNAVAILABLE)
    }

    this._keyStore = new KeyStore(this.options.keys);

    this.setCollection(docs, index);
  }

  setCollection(docs, index) {
    this._docs = docs;

    if (index && !(index instanceof FuseIndex)) {
      throw new Error(INCORRECT_INDEX_TYPE)
    }

    this._myIndex =
      index ||
      createIndex(this.options.keys, this._docs, {
        getFn: this.options.getFn,
        fieldNormWeight: this.options.fieldNormWeight
      });
  }

  add(doc) {
    if (!isDefined(doc)) {
      return
    }

    this._docs.push(doc);
    this._myIndex.add(doc);
  }

  remove(predicate = (/* doc, idx */) => false) {
    const results = [];

    for (let i = 0, len = this._docs.length; i < len; i += 1) {
      const doc = this._docs[i];
      if (predicate(doc, i)) {
        this.removeAt(i);
        i -= 1;
        len -= 1;

        results.push(doc);
      }
    }

    return results
  }

  removeAt(idx) {
    this._docs.splice(idx, 1);
    this._myIndex.removeAt(idx);
  }

  getIndex() {
    return this._myIndex
  }

  search(query, { limit = -1 } = {}) {
    const {
      includeMatches,
      includeScore,
      shouldSort,
      sortFn,
      ignoreFieldNorm
    } = this.options;

    let results = isString(query)
      ? isString(this._docs[0])
        ? this._searchStringList(query)
        : this._searchObjectList(query)
      : this._searchLogical(query);

    computeScore(results, { ignoreFieldNorm });

    if (shouldSort) {
      results.sort(sortFn);
    }

    if (isNumber(limit) && limit > -1) {
      results = results.slice(0, limit);
    }

    return format(results, this._docs, {
      includeMatches,
      includeScore
    })
  }

  _searchStringList(query) {
    const searcher = createSearcher(query, this.options);
    const { records } = this._myIndex;
    const results = [];

    // Iterate over every string in the index
    records.forEach(({ v: text, i: idx, n: norm }) => {
      if (!isDefined(text)) {
        return
      }

      const { isMatch, score, indices } = searcher.searchIn(text);

      if (isMatch) {
        results.push({
          item: text,
          idx,
          matches: [{ score, value: text, norm, indices }]
        });
      }
    });

    return results
  }

  _searchLogical(query) {

    const expression = parse(query, this.options);

    const evaluate = (node, item, idx) => {
      if (!node.children) {
        const { keyId, searcher } = node;

        const matches = this._findMatches({
          key: this._keyStore.get(keyId),
          value: this._myIndex.getValueForItemAtKeyId(item, keyId),
          searcher
        });

        if (matches && matches.length) {
          return [
            {
              idx,
              item,
              matches
            }
          ]
        }

        return []
      }

      const res = [];
      for (let i = 0, len = node.children.length; i < len; i += 1) {
        const child = node.children[i];
        const result = evaluate(child, item, idx);
        if (result.length) {
          res.push(...result);
        } else if (node.operator === LogicalOperator.AND) {
          return []
        }
      }
      return res
    };

    const records = this._myIndex.records;
    const resultMap = {};
    const results = [];

    records.forEach(({ $: item, i: idx }) => {
      if (isDefined(item)) {
        let expResults = evaluate(expression, item, idx);

        if (expResults.length) {
          // Dedupe when adding
          if (!resultMap[idx]) {
            resultMap[idx] = { idx, item, matches: [] };
            results.push(resultMap[idx]);
          }
          expResults.forEach(({ matches }) => {
            resultMap[idx].matches.push(...matches);
          });
        }
      }
    });

    return results
  }

  _searchObjectList(query) {
    const searcher = createSearcher(query, this.options);
    const { keys, records } = this._myIndex;
    const results = [];

    // List is Array<Object>
    records.forEach(({ $: item, i: idx }) => {
      if (!isDefined(item)) {
        return
      }

      let matches = [];

      // Iterate over every key (i.e, path), and fetch the value at that key
      keys.forEach((key, keyIndex) => {
        matches.push(
          ...this._findMatches({
            key,
            value: item[keyIndex],
            searcher
          })
        );
      });

      if (matches.length) {
        results.push({
          idx,
          item,
          matches
        });
      }
    });

    return results
  }
  _findMatches({ key, value, searcher }) {
    if (!isDefined(value)) {
      return []
    }

    let matches = [];

    if (isArray(value)) {
      value.forEach(({ v: text, i: idx, n: norm }) => {
        if (!isDefined(text)) {
          return
        }

        const { isMatch, score, indices } = searcher.searchIn(text);

        if (isMatch) {
          matches.push({
            score,
            key,
            value: text,
            idx,
            norm,
            indices
          });
        }
      });
    } else {
      const { v: text, n: norm } = value;

      const { isMatch, score, indices } = searcher.searchIn(text);

      if (isMatch) {
        matches.push({ score, key, value: text, norm, indices });
      }
    }

    return matches
  }
}

Fuse.version = '7.1.0';
Fuse.createIndex = createIndex;
Fuse.parseIndex = parseIndex;
Fuse.config = Config;

{
  Fuse.parseQuery = parse;
}

{
  register(ExtendedSearch);
}

var DEFAULT_SEARCH_OPTIONS = {
  keys: [{
    name: 'title',
    weight: 0.5
  }, {
    name: 'artist',
    weight: 0.3
  }, {
    name: 'album',
    weight: 0.1
  }, {
    name: 'playlist',
    weight: 0.1
  }],
  threshold: 0.4,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
  useExtendedSearch: true
};
var LocalSearchService = /*#__PURE__*/function () {
  function LocalSearchService() {
    _classCallCheck(this, LocalSearchService);
    this.fuse = null;
    this.videos = [];
    this.indexedPlaylists = new Set();
    this.videos = [];
    this.fuse = null;
  }
  /**
   * Index videos from playlists for searching
   */
  return _createClass(LocalSearchService, [{
    key: "indexVideos",
    value: function indexVideos(playlists) {
      this.videos = [];
      this.indexedPlaylists.clear();
      for (var _i = 0, _Object$entries = Object.entries(playlists); _i < _Object$entries.length; _i++) {
        var _Object$entries$_i = _slicedToArray(_Object$entries[_i], 2),
          playlistName = _Object$entries$_i[0],
          playlistVideos = _Object$entries$_i[1];
        this.indexedPlaylists.add(playlistName);
        var _iterator = _createForOfIteratorHelper(playlistVideos),
          _step;
        try {
          for (_iterator.s(); !(_step = _iterator.n()).done;) {
            var video = _step.value;
            this.videos.push(_objectSpread2(_objectSpread2({}, video), {}, {
              playlist: playlistName
            }));
          }
        } catch (err) {
          _iterator.e(err);
        } finally {
          _iterator.f();
        }
      }
      this.fuse = new Fuse(this.videos, DEFAULT_SEARCH_OPTIONS);
      console.log("[LocalSearchService] Indexed ".concat(this.videos.length, " videos from ").concat(this.indexedPlaylists.size, " playlists"));
    }
    /**
     * Add videos from a single playlist to the index
     */
  }, {
    key: "addPlaylist",
    value: function addPlaylist(playlistName, videos) {
      if (this.indexedPlaylists.has(playlistName)) {
        // Remove existing videos from this playlist
        this.videos = this.videos.filter(function (v) {
          return v.playlist !== playlistName;
        });
      }
      this.indexedPlaylists.add(playlistName);
      var _iterator2 = _createForOfIteratorHelper(videos),
        _step2;
      try {
        for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
          var video = _step2.value;
          this.videos.push(_objectSpread2(_objectSpread2({}, video), {}, {
            playlist: playlistName
          }));
        }
        // Rebuild index
      } catch (err) {
        _iterator2.e(err);
      } finally {
        _iterator2.f();
      }
      this.fuse = new Fuse(this.videos, DEFAULT_SEARCH_OPTIONS);
    }
    /**
     * Search for videos matching the query
     */
  }, {
    key: "search",
    value: function search(query, options) {
      var _options$threshold, _options$limit;
      if (!this.fuse || !query.trim()) {
        return [];
      }
      var searchOptions = _objectSpread2(_objectSpread2({}, DEFAULT_SEARCH_OPTIONS), {}, {
        threshold: (_options$threshold = options === null || options === void 0 ? void 0 : options.threshold) !== null && _options$threshold !== void 0 ? _options$threshold : DEFAULT_SEARCH_OPTIONS.threshold
      });
      // Update fuse options if custom keys provided
      if (options !== null && options !== void 0 && options.keys) {
        searchOptions.keys = options.keys;
        this.fuse = new Fuse(this.videos, searchOptions);
      }
      var results = this.fuse.search(query);
      var limit = (_options$limit = options === null || options === void 0 ? void 0 : options.limit) !== null && _options$limit !== void 0 ? _options$limit : 50;
      return results.slice(0, limit).map(function (result) {
        var _result$score;
        return {
          item: result.item,
          score: (_result$score = result.score) !== null && _result$score !== void 0 ? _result$score : 0,
          matches: result.matches
        };
      });
    }
    /**
     * Search within a specific playlist
     */
  }, {
    key: "searchInPlaylist",
    value: function searchInPlaylist(query, playlistName, options) {
      var _options$threshold2, _options$limit2;
      var playlistVideos = this.videos.filter(function (v) {
        return v.playlist === playlistName;
      });
      if (playlistVideos.length === 0 || !query.trim()) {
        return [];
      }
      var playlistFuse = new Fuse(playlistVideos, _objectSpread2(_objectSpread2({}, DEFAULT_SEARCH_OPTIONS), {}, {
        threshold: (_options$threshold2 = options === null || options === void 0 ? void 0 : options.threshold) !== null && _options$threshold2 !== void 0 ? _options$threshold2 : DEFAULT_SEARCH_OPTIONS.threshold
      }));
      var results = playlistFuse.search(query);
      var limit = (_options$limit2 = options === null || options === void 0 ? void 0 : options.limit) !== null && _options$limit2 !== void 0 ? _options$limit2 : 50;
      return results.slice(0, limit).map(function (result) {
        var _result$score2;
        return {
          item: result.item,
          score: (_result$score2 = result.score) !== null && _result$score2 !== void 0 ? _result$score2 : 0,
          matches: result.matches
        };
      });
    }
    /**
     * Get all videos grouped by playlist
     */
  }, {
    key: "getVideosByPlaylist",
    value: function getVideosByPlaylist() {
      var grouped = {};
      var _iterator3 = _createForOfIteratorHelper(this.videos),
        _step3;
      try {
        for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
          var video = _step3.value;
          var playlist = video.playlist || 'Unknown';
          if (!grouped[playlist]) {
            grouped[playlist] = [];
          }
          grouped[playlist].push(video);
        }
      } catch (err) {
        _iterator3.e(err);
      } finally {
        _iterator3.f();
      }
      return grouped;
    }
    /**
     * Get all playlist names
     */
  }, {
    key: "getPlaylistNames",
    value: function getPlaylistNames() {
      return Array.from(this.indexedPlaylists).sort();
    }
    /**
     * Get videos from a specific playlist
     */
  }, {
    key: "getPlaylistVideos",
    value: function getPlaylistVideos(playlistName) {
      return this.videos.filter(function (v) {
        return v.playlist === playlistName;
      });
    }
    /**
     * Get total video count
     */
  }, {
    key: "getVideoCount",
    value: function getVideoCount() {
      return this.videos.length;
    }
    /**
     * Get all videos (for browsing)
     */
  }, {
    key: "getAllVideos",
    value: function getAllVideos() {
      return _toConsumableArray(this.videos);
    }
    /**
     * Filter videos by artist
     */
  }, {
    key: "filterByArtist",
    value: function filterByArtist(artist) {
      return this.videos.filter(function (v) {
        var _v$artist;
        return (_v$artist = v.artist) === null || _v$artist === void 0 ? void 0 : _v$artist.toLowerCase().includes(artist.toLowerCase());
      });
    }
    /**
     * Get unique artists
     */
  }, {
    key: "getArtists",
    value: function getArtists() {
      var artists = new Set();
      var _iterator4 = _createForOfIteratorHelper(this.videos),
        _step4;
      try {
        for (_iterator4.s(); !(_step4 = _iterator4.n()).done;) {
          var video = _step4.value;
          if (video.artist) {
            artists.add(video.artist);
          }
        }
      } catch (err) {
        _iterator4.e(err);
      } finally {
        _iterator4.f();
      }
      return Array.from(artists).sort();
    }
    /**
     * Sort videos by various criteria
     */
  }, {
    key: "sortVideos",
    value: function sortVideos(videos, sortBy) {
      var ascending = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
      var sorted = _toConsumableArray(videos).sort(function (a, b) {
        var _a$title$toLowerCase, _a$title, _b$title$toLowerCase, _b$title, _a$artist$toLowerCase, _a$artist, _b$artist$toLowerCase, _b$artist, _a$playlist$toLowerCa, _a$playlist, _b$playlist$toLowerCa, _b$playlist, _a$duration, _b$duration;
        var aVal = '';
        var bVal = '';
        switch (sortBy) {
          case 'title':
            aVal = (_a$title$toLowerCase = (_a$title = a.title) === null || _a$title === void 0 ? void 0 : _a$title.toLowerCase()) !== null && _a$title$toLowerCase !== void 0 ? _a$title$toLowerCase : '';
            bVal = (_b$title$toLowerCase = (_b$title = b.title) === null || _b$title === void 0 ? void 0 : _b$title.toLowerCase()) !== null && _b$title$toLowerCase !== void 0 ? _b$title$toLowerCase : '';
            break;
          case 'artist':
            aVal = (_a$artist$toLowerCase = (_a$artist = a.artist) === null || _a$artist === void 0 ? void 0 : _a$artist.toLowerCase()) !== null && _a$artist$toLowerCase !== void 0 ? _a$artist$toLowerCase : '';
            bVal = (_b$artist$toLowerCase = (_b$artist = b.artist) === null || _b$artist === void 0 ? void 0 : _b$artist.toLowerCase()) !== null && _b$artist$toLowerCase !== void 0 ? _b$artist$toLowerCase : '';
            break;
          case 'playlist':
            aVal = (_a$playlist$toLowerCa = (_a$playlist = a.playlist) === null || _a$playlist === void 0 ? void 0 : _a$playlist.toLowerCase()) !== null && _a$playlist$toLowerCa !== void 0 ? _a$playlist$toLowerCa : '';
            bVal = (_b$playlist$toLowerCa = (_b$playlist = b.playlist) === null || _b$playlist === void 0 ? void 0 : _b$playlist.toLowerCase()) !== null && _b$playlist$toLowerCa !== void 0 ? _b$playlist$toLowerCa : '';
            break;
          case 'duration':
            aVal = (_a$duration = a.duration) !== null && _a$duration !== void 0 ? _a$duration : 0;
            bVal = (_b$duration = b.duration) !== null && _b$duration !== void 0 ? _b$duration : 0;
            break;
        }
        if (aVal < bVal) return ascending ? -1 : 1;
        if (aVal > bVal) return ascending ? 1 : -1;
        return 0;
      });
      return sorted;
    }
    /**
     * Clear the search index
     */
  }, {
    key: "clear",
    value: function clear() {
      this.videos = [];
      this.fuse = null;
      this.indexedPlaylists.clear();
    }
  }]);
}();
// Export singleton instance
var localSearchService = new LocalSearchService();

var DEFAULT_MAX_RESULTS = 25;
var YouTubeSearchService = /*#__PURE__*/function () {
  function YouTubeSearchService(apiKey) {
    _classCallCheck(this, YouTubeSearchService);
    this.apiKey = null;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
    this.apiKey = apiKey || null;
  }
  /**
   * Set the YouTube API key
   */
  return _createClass(YouTubeSearchService, [{
    key: "setApiKey",
    value: function setApiKey(apiKey) {
      this.apiKey = apiKey;
    }
    /**
     * Check if API key is configured
     */
  }, {
    key: "isConfigured",
    value: function isConfigured() {
      return this.apiKey !== null && this.apiKey.length > 0;
    }
    /**
     * Search YouTube for videos
     */
  }, {
    key: "search",
    value: (function () {
      var _search = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(query, options) {
        var _searchResponse$data$, searchResponse, videoIds, videoDetails, detailsResponse, _iterator, _step, _item$contentDetails, _item$statistics, item, videos, _error$response, _error$response2, _t;
        return _regenerator().w(function (_context) {
          while (1) switch (_context.p = _context.n) {
            case 0:
              if (this.apiKey) {
                _context.n = 1;
                break;
              }
              console.warn('[YouTubeSearchService] API key not configured');
              return _context.a(2, {
                videos: [],
                totalResults: 0
              });
            case 1:
              _context.p = 1;
              _context.n = 2;
              return axios.get("".concat(this.baseUrl, "/search"), {
                params: {
                  part: 'snippet',
                  q: query,
                  type: (options === null || options === void 0 ? void 0 : options.type) || 'video',
                  maxResults: (options === null || options === void 0 ? void 0 : options.maxResults) || DEFAULT_MAX_RESULTS,
                  pageToken: options === null || options === void 0 ? void 0 : options.pageToken,
                  order: (options === null || options === void 0 ? void 0 : options.order) || 'relevance',
                  videoDuration: options === null || options === void 0 ? void 0 : options.videoDuration,
                  key: this.apiKey
                }
              });
            case 2:
              searchResponse = _context.v;
              videoIds = searchResponse.data.items.filter(function (item) {
                var _item$id;
                return (_item$id = item.id) === null || _item$id === void 0 ? void 0 : _item$id.videoId;
              }).map(function (item) {
                return item.id.videoId;
              }).join(','); // Get video details (duration, view count) if we have video IDs
              videoDetails = {};
              if (!videoIds) {
                _context.n = 4;
                break;
              }
              _context.n = 3;
              return axios.get("".concat(this.baseUrl, "/videos"), {
                params: {
                  part: 'contentDetails,statistics',
                  id: videoIds,
                  key: this.apiKey
                }
              });
            case 3:
              detailsResponse = _context.v;
              _iterator = _createForOfIteratorHelper(detailsResponse.data.items);
              try {
                for (_iterator.s(); !(_step = _iterator.n()).done;) {
                  item = _step.value;
                  videoDetails[item.id] = {
                    duration: this.formatDuration((_item$contentDetails = item.contentDetails) === null || _item$contentDetails === void 0 ? void 0 : _item$contentDetails.duration),
                    viewCount: this.formatViewCount((_item$statistics = item.statistics) === null || _item$statistics === void 0 ? void 0 : _item$statistics.viewCount)
                  };
                }
              } catch (err) {
                _iterator.e(err);
              } finally {
                _iterator.f();
              }
            case 4:
              videos = searchResponse.data.items.filter(function (item) {
                var _item$id2;
                return (_item$id2 = item.id) === null || _item$id2 === void 0 ? void 0 : _item$id2.videoId;
              }).map(function (item) {
                var _item$snippet$thumbna, _item$snippet$thumbna2, _videoDetails$item$id, _videoDetails$item$id2;
                return {
                  id: item.id.videoId,
                  title: item.snippet.title,
                  channelTitle: item.snippet.channelTitle,
                  thumbnailUrl: ((_item$snippet$thumbna = item.snippet.thumbnails) === null || _item$snippet$thumbna === void 0 || (_item$snippet$thumbna = _item$snippet$thumbna.medium) === null || _item$snippet$thumbna === void 0 ? void 0 : _item$snippet$thumbna.url) || ((_item$snippet$thumbna2 = item.snippet.thumbnails) === null || _item$snippet$thumbna2 === void 0 || (_item$snippet$thumbna2 = _item$snippet$thumbna2["default"]) === null || _item$snippet$thumbna2 === void 0 ? void 0 : _item$snippet$thumbna2.url),
                  duration: (_videoDetails$item$id = videoDetails[item.id.videoId]) === null || _videoDetails$item$id === void 0 ? void 0 : _videoDetails$item$id.duration,
                  viewCount: (_videoDetails$item$id2 = videoDetails[item.id.videoId]) === null || _videoDetails$item$id2 === void 0 ? void 0 : _videoDetails$item$id2.viewCount,
                  publishedAt: item.snippet.publishedAt,
                  description: item.snippet.description
                };
              });
              return _context.a(2, {
                videos: videos,
                nextPageToken: searchResponse.data.nextPageToken,
                totalResults: ((_searchResponse$data$ = searchResponse.data.pageInfo) === null || _searchResponse$data$ === void 0 ? void 0 : _searchResponse$data$.totalResults) || videos.length
              });
            case 5:
              _context.p = 5;
              _t = _context.v;
              console.error('[YouTubeSearchService] Search error:', ((_error$response = _t.response) === null || _error$response === void 0 ? void 0 : _error$response.data) || _t.message);
              throw new Error(((_error$response2 = _t.response) === null || _error$response2 === void 0 || (_error$response2 = _error$response2.data) === null || _error$response2 === void 0 || (_error$response2 = _error$response2.error) === null || _error$response2 === void 0 ? void 0 : _error$response2.message) || 'YouTube search failed');
            case 6:
              return _context.a(2);
          }
        }, _callee, this, [[1, 5]]);
      }));
      function search(_x, _x2) {
        return _search.apply(this, arguments);
      }
      return search;
    }()
    /**
     * Get video details by ID
     */
    )
  }, {
    key: "getVideoDetails",
    value: (function () {
      var _getVideoDetails = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(videoId) {
        var _response$data$items, _item$snippet$thumbna3, _item$snippet$thumbna4, _item$contentDetails2, _item$statistics2, response, item, _error$response3, _t2;
        return _regenerator().w(function (_context2) {
          while (1) switch (_context2.p = _context2.n) {
            case 0:
              if (this.apiKey) {
                _context2.n = 1;
                break;
              }
              console.warn('[YouTubeSearchService] API key not configured');
              return _context2.a(2, null);
            case 1:
              _context2.p = 1;
              _context2.n = 2;
              return axios.get("".concat(this.baseUrl, "/videos"), {
                params: {
                  part: 'snippet,contentDetails,statistics',
                  id: videoId,
                  key: this.apiKey
                }
              });
            case 2:
              response = _context2.v;
              item = (_response$data$items = response.data.items) === null || _response$data$items === void 0 ? void 0 : _response$data$items[0];
              if (item) {
                _context2.n = 3;
                break;
              }
              return _context2.a(2, null);
            case 3:
              return _context2.a(2, {
                id: item.id,
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                thumbnailUrl: ((_item$snippet$thumbna3 = item.snippet.thumbnails) === null || _item$snippet$thumbna3 === void 0 || (_item$snippet$thumbna3 = _item$snippet$thumbna3.medium) === null || _item$snippet$thumbna3 === void 0 ? void 0 : _item$snippet$thumbna3.url) || ((_item$snippet$thumbna4 = item.snippet.thumbnails) === null || _item$snippet$thumbna4 === void 0 || (_item$snippet$thumbna4 = _item$snippet$thumbna4["default"]) === null || _item$snippet$thumbna4 === void 0 ? void 0 : _item$snippet$thumbna4.url),
                duration: this.formatDuration((_item$contentDetails2 = item.contentDetails) === null || _item$contentDetails2 === void 0 ? void 0 : _item$contentDetails2.duration),
                viewCount: this.formatViewCount((_item$statistics2 = item.statistics) === null || _item$statistics2 === void 0 ? void 0 : _item$statistics2.viewCount),
                publishedAt: item.snippet.publishedAt,
                description: item.snippet.description
              });
            case 4:
              _context2.p = 4;
              _t2 = _context2.v;
              console.error('[YouTubeSearchService] Get video details error:', ((_error$response3 = _t2.response) === null || _error$response3 === void 0 ? void 0 : _error$response3.data) || _t2.message);
              return _context2.a(2, null);
          }
        }, _callee2, this, [[1, 4]]);
      }));
      function getVideoDetails(_x3) {
        return _getVideoDetails.apply(this, arguments);
      }
      return getVideoDetails;
    }()
    /**
     * Get trending music videos
     */
    )
  }, {
    key: "getTrendingMusic",
    value: (function () {
      var _getTrendingMusic = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3() {
        var _this = this;
        var regionCode,
          maxResults,
          response,
          _error$response4,
          _args3 = arguments,
          _t3;
        return _regenerator().w(function (_context3) {
          while (1) switch (_context3.p = _context3.n) {
            case 0:
              regionCode = _args3.length > 0 && _args3[0] !== undefined ? _args3[0] : 'US';
              maxResults = _args3.length > 1 && _args3[1] !== undefined ? _args3[1] : 25;
              if (this.apiKey) {
                _context3.n = 1;
                break;
              }
              console.warn('[YouTubeSearchService] API key not configured');
              return _context3.a(2, []);
            case 1:
              _context3.p = 1;
              _context3.n = 2;
              return axios.get("".concat(this.baseUrl, "/videos"), {
                params: {
                  part: 'snippet,contentDetails,statistics',
                  chart: 'mostPopular',
                  videoCategoryId: '10',
                  // Music category
                  regionCode: regionCode,
                  maxResults: maxResults,
                  key: this.apiKey
                }
              });
            case 2:
              response = _context3.v;
              return _context3.a(2, response.data.items.map(function (item) {
                var _item$snippet$thumbna5, _item$contentDetails3, _item$statistics3;
                return {
                  id: item.id,
                  title: item.snippet.title,
                  channelTitle: item.snippet.channelTitle,
                  thumbnailUrl: (_item$snippet$thumbna5 = item.snippet.thumbnails) === null || _item$snippet$thumbna5 === void 0 || (_item$snippet$thumbna5 = _item$snippet$thumbna5.medium) === null || _item$snippet$thumbna5 === void 0 ? void 0 : _item$snippet$thumbna5.url,
                  duration: _this.formatDuration((_item$contentDetails3 = item.contentDetails) === null || _item$contentDetails3 === void 0 ? void 0 : _item$contentDetails3.duration),
                  viewCount: _this.formatViewCount((_item$statistics3 = item.statistics) === null || _item$statistics3 === void 0 ? void 0 : _item$statistics3.viewCount),
                  publishedAt: item.snippet.publishedAt,
                  description: item.snippet.description
                };
              }));
            case 3:
              _context3.p = 3;
              _t3 = _context3.v;
              console.error('[YouTubeSearchService] Get trending error:', ((_error$response4 = _t3.response) === null || _error$response4 === void 0 ? void 0 : _error$response4.data) || _t3.message);
              return _context3.a(2, []);
          }
        }, _callee3, this, [[1, 3]]);
      }));
      function getTrendingMusic() {
        return _getTrendingMusic.apply(this, arguments);
      }
      return getTrendingMusic;
    }()
    /**
     * Format ISO 8601 duration to human readable
     */
    )
  }, {
    key: "formatDuration",
    value: function formatDuration(isoDuration) {
      if (!isoDuration) return '';
      var match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return '';
      var hours = parseInt(match[1] || '0', 10);
      var minutes = parseInt(match[2] || '0', 10);
      var seconds = parseInt(match[3] || '0', 10);
      if (hours > 0) {
        return "".concat(hours, ":").concat(minutes.toString().padStart(2, '0'), ":").concat(seconds.toString().padStart(2, '0'));
      }
      return "".concat(minutes, ":").concat(seconds.toString().padStart(2, '0'));
    }
    /**
     * Format view count to human readable
     */
  }, {
    key: "formatViewCount",
    value: function formatViewCount(count) {
      if (!count) return '';
      var num = parseInt(count, 10);
      if (num >= 1000000000) {
        return "".concat((num / 1000000000).toFixed(1), "B views");
      }
      if (num >= 1000000) {
        return "".concat((num / 1000000).toFixed(1), "M views");
      }
      if (num >= 1000) {
        return "".concat((num / 1000).toFixed(1), "K views");
      }
      return "".concat(num, " views");
    }
    /**
     * Parse YouTube URL to extract video ID
     */
  }], [{
    key: "parseVideoUrl",
    value: function parseVideoUrl(url) {
      var patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/, /youtube\.com\/v\/([^&\n?#]+)/];
      for (var _i = 0, _patterns = patterns; _i < _patterns.length; _i++) {
        var pattern = _patterns[_i];
        var match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    }
    /**
     * Build YouTube embed URL
     */
  }, {
    key: "getEmbedUrl",
    value: function getEmbedUrl(videoId) {
      var autoplay = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      return "https://www.youtube.com/embed/".concat(videoId, "?autoplay=").concat(autoplay ? 1 : 0, "&rel=0");
    }
    /**
     * Build YouTube watch URL
     */
  }, {
    key: "getWatchUrl",
    value: function getWatchUrl(videoId) {
      return "https://www.youtube.com/watch?v=".concat(videoId);
    }
  }]);
}();
// Export singleton instance (API key should be set by app)
var youtubeSearchService = new YouTubeSearchService();

/**
 * Supabase Configuration for DJAMMS Player
 *
 * This file contains the configuration for connecting to the Supabase backend.
 * The values are hardcoded for now but could be moved to environment variables.
 */
// DJAMMS_Obie_Server Project Configuration
var SUPABASE_URL = 'https://lfvhgdbnecjeuciadimx.supabase.co';
// Public anon key - safe to expose in client-side code
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdmhnZGJuZWNqZXVjaWFkaW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTc2MjIsImV4cCI6MjA3OTI3MzYyMn0.kSVtXnNVRofDol8L20oflgdo7A82BgAMco2FoFHRkG8';
// Default player ID - can be customized by user in Settings
// Must be at least 6 characters and unique on Supabase
var DEFAULT_PLAYER_ID = 'DEMO_PLAYER';
// Heartbeat interval in milliseconds (30 seconds)
var HEARTBEAT_INTERVAL = 30000;
// State sync debounce time (prevent excessive updates)
var STATE_SYNC_DEBOUNCE = 1000; // 1 second debounce to reduce update spam
// Maximum age for pending commands before considered expired (5 minutes)
var COMMAND_EXPIRY_MS = 5 * 60 * 1000;

/**
 * SupabaseService Singleton
 */
var SupabaseService = /*#__PURE__*/function () {
  function SupabaseService() {
    _classCallCheck(this, SupabaseService);
    this.client = null;
    this.playerId = DEFAULT_PLAYER_ID;
    this.playerStateId = null; // UUID of the player_state row
    // Subscriptions
    this.commandChannel = null;
    this.heartbeatInterval = null;
    this.stateSyncTimeout = null;
    this.commandPollInterval = null;
    // Command handlers
    this.commandHandlers = new Map();
    // Command deduplication - track processed command IDs to prevent double execution
    this.processedCommandIds = new Set();
    this.processingCommandIds = new Set(); // Commands currently being processed
    // State tracking
    this.isInitialized = false;
    this.isOnline = false;
    this.lastSyncedState = null;
    this.lastSyncKey = null; // For deduplication of identical syncs
    // Private constructor for singleton
  }
  /**
   * Get the singleton instance
   */
  return _createClass(SupabaseService, [{
    key: "initialize",
    value: (
    /**
     * Initialize the Supabase service
     * @param playerId - Optional player ID (defaults to DEFAULT_PLAYER_ID)
     */
    function () {
      var _initialize = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(playerId) {
        var _t;
        return _regenerator().w(function (_context) {
          while (1) switch (_context.p = _context.n) {
            case 0:
              if (!this.isInitialized) {
                _context.n = 1;
                break;
              }
              console.log('[SupabaseService] Already initialized');
              return _context.a(2, true);
            case 1:
              _context.p = 1;
              this.playerId = playerId || DEFAULT_PLAYER_ID;
              // Create Supabase client
              this.client = supabaseJs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                realtime: {
                  params: {
                    eventsPerSecond: 10
                  }
                }
              });
              // Initialize or get player state row
              _context.n = 2;
              return this.initializePlayerState();
            case 2:
              _context.n = 3;
              return this.startCommandListener();
            case 3:
              // Start heartbeat
              this.startHeartbeat();
              this.isInitialized = true;
              this.isOnline = true;
              console.log("[SupabaseService] Initialized for player: ".concat(this.playerId));
              return _context.a(2, true);
            case 4:
              _context.p = 4;
              _t = _context.v;
              console.error('[SupabaseService] Initialization failed:', _t);
              this.isInitialized = false;
              return _context.a(2, false);
          }
        }, _callee, this, [[1, 4]]);
      }));
      function initialize(_x) {
        return _initialize.apply(this, arguments);
      }
      return initialize;
    }()
    /**
     * Shutdown the service gracefully
     */
    )
  }, {
    key: "shutdown",
    value: (function () {
      var _shutdown = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
        return _regenerator().w(function (_context2) {
          while (1) switch (_context2.n) {
            case 0:
              console.log('[SupabaseService] Shutting down...');
              // Mark as offline
              _context2.n = 1;
              return this.setOnlineStatus(false);
            case 1:
              // Stop heartbeat
              if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
              }
              // Stop command polling
              if (this.commandPollInterval) {
                clearInterval(this.commandPollInterval);
                this.commandPollInterval = null;
              }
              // Cancel pending state sync
              if (this.stateSyncTimeout) {
                clearTimeout(this.stateSyncTimeout);
                this.stateSyncTimeout = null;
              }
              // Unsubscribe from realtime
              if (!this.commandChannel) {
                _context2.n = 3;
                break;
              }
              _context2.n = 2;
              return this.commandChannel.unsubscribe();
            case 2:
              this.commandChannel = null;
            case 3:
              this.isInitialized = false;
              this.isOnline = false;
              console.log('[SupabaseService] Shutdown complete');
            case 4:
              return _context2.a(2);
          }
        }, _callee2, this);
      }));
      function shutdown() {
        return _shutdown.apply(this, arguments);
      }
      return shutdown;
    }() // ==================== Player State Management ====================
    /**
     * Initialize or fetch existing player state row
     */
    )
  }, {
    key: "initializePlayerState",
    value: function () {
      var _initializePlayerState = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3() {
        var _yield$this$client$fr, existing, fetchError, _yield$this$client$fr2, newState, insertError;
        return _regenerator().w(function (_context3) {
          while (1) switch (_context3.n) {
            case 0:
              if (this.client) {
                _context3.n = 1;
                break;
              }
              throw new Error('Client not initialized');
            case 1:
              _context3.n = 2;
              return this.client.from('player_state').select('id').eq('player_id', this.playerId).single();
            case 2:
              _yield$this$client$fr = _context3.v;
              existing = _yield$this$client$fr.data;
              fetchError = _yield$this$client$fr.error;
              if (fetchError && fetchError.code !== 'PGRST116') {
                // PGRST116 = no rows found (not an error for us)
                console.error('[SupabaseService] Error fetching player state:', fetchError);
              }
              if (!existing) {
                _context3.n = 4;
                break;
              }
              this.playerStateId = existing.id;
              console.log("[SupabaseService] Found existing player state: ".concat(this.playerStateId));
              // Update online status
              _context3.n = 3;
              return this.setOnlineStatus(true);
            case 3:
              _context3.n = 7;
              break;
            case 4:
              _context3.n = 5;
              return this.client.from('player_state').insert({
                player_id: this.playerId,
                status: 'idle',
                is_playing: false,
                is_online: true,
                volume: 1.0,
                volume_level: 0.8,
                playback_position: 0,
                current_position: 0,
                active_queue: [],
                priority_queue: [],
                last_heartbeat: new Date().toISOString()
              }).select('id').single();
            case 5:
              _yield$this$client$fr2 = _context3.v;
              newState = _yield$this$client$fr2.data;
              insertError = _yield$this$client$fr2.error;
              if (!insertError) {
                _context3.n = 6;
                break;
              }
              throw new Error("Failed to create player state: ".concat(insertError.message));
            case 6:
              this.playerStateId = newState.id;
              console.log("[SupabaseService] Created new player state: ".concat(this.playerStateId));
            case 7:
              return _context3.a(2);
          }
        }, _callee3, this);
      }));
      function initializePlayerState() {
        return _initializePlayerState.apply(this, arguments);
      }
      return initializePlayerState;
    }()
    /**
     * Update player online status
     */
  }, {
    key: "setOnlineStatus",
    value: (function () {
      var _setOnlineStatus = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(isOnline) {
        var _yield$this$client$fr3, error;
        return _regenerator().w(function (_context4) {
          while (1) switch (_context4.n) {
            case 0:
              if (!(!this.client || !this.playerStateId)) {
                _context4.n = 1;
                break;
              }
              return _context4.a(2);
            case 1:
              _context4.n = 2;
              return this.client.from('player_state').update({
                is_online: isOnline,
                last_heartbeat: new Date().toISOString()
              }).eq('id', this.playerStateId);
            case 2:
              _yield$this$client$fr3 = _context4.v;
              error = _yield$this$client$fr3.error;
              if (error) {
                console.error('[SupabaseService] Error updating online status:', error);
              } else {
                this.isOnline = isOnline;
              }
            case 3:
              return _context4.a(2);
          }
        }, _callee4, this);
      }));
      function setOnlineStatus(_x2) {
        return _setOnlineStatus.apply(this, arguments);
      }
      return setOnlineStatus;
    }()
    /**
     * Sync player state to Supabase (debounced by default, immediate if specified)
     * @param state - The state to sync
     * @param immediate - If true, bypass debounce and sync immediately (use for shuffle, etc.)
     */
    )
  }, {
    key: "syncPlayerState",
    value: function syncPlayerState(state) {
      var _this = this;
      var immediate = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      // Clear any pending debounced update
      if (this.stateSyncTimeout) {
        clearTimeout(this.stateSyncTimeout);
      }
      if (immediate) {
        // Sync immediately (for queue shuffle, etc.)
        this.performStateSync(state);
      } else {
        // Debounce rapid updates
        this.stateSyncTimeout = setTimeout(function () {
          _this.performStateSync(state);
        }, STATE_SYNC_DEBOUNCE);
      }
    }
    /**
     * Perform the actual state sync to Supabase
     */
  }, {
    key: "performStateSync",
    value: (function () {
      var _performStateSync = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(state) {
        var _this2 = this;
        var _updateData$now_playi, _updateData$active_qu, _updateData$priority_, _updateData$now_playi2, _updateData$active_qu2, _updateData$priority_2, updateData, updateKey, _yield$this$client$fr4, error, _t2;
        return _regenerator().w(function (_context5) {
          while (1) switch (_context5.p = _context5.n) {
            case 0:
              if (!(!this.client || !this.playerStateId)) {
                _context5.n = 1;
                break;
              }
              console.warn('[SupabaseService] Cannot sync state - not initialized');
              return _context5.a(2);
            case 1:
              _context5.p = 1;
              updateData = {
                last_updated: new Date().toISOString()
              }; // Map local state to Supabase schema
              if (state.status !== undefined) {
                updateData.status = state.status;
              }
              if (state.isPlaying !== undefined) {
                updateData.is_playing = state.isPlaying;
              }
              if (state.currentVideo !== undefined) {
                updateData.now_playing_video = state.currentVideo ? this.videoToNowPlaying(state.currentVideo) : null;
              }
              if (state.currentPosition !== undefined) {
                updateData.current_position = state.currentPosition;
                updateData.playback_position = Math.floor(state.currentPosition);
              }
              if (state.volume !== undefined) {
                updateData.volume = state.volume;
                updateData.volume_level = state.volume;
              }
              if (state.activeQueue !== undefined) {
                updateData.active_queue = state.activeQueue.map(function (v) {
                  return _this2.videoToQueueItem(v);
                });
              }
              if (state.priorityQueue !== undefined) {
                updateData.priority_queue = state.priorityQueue.map(function (v) {
                  return _this2.videoToQueueItem(v);
                });
              }
              if (state.queueIndex !== undefined) {
                updateData.queue_index = state.queueIndex;
              }
              // Only update if something changed
              if (!(Object.keys(updateData).length <= 1)) {
                _context5.n = 2;
                break;
              }
              return _context5.a(2);
            case 2:
              // Check if this update is identical to the last one (skip duplicate syncs)
              updateKey = JSON.stringify({
                now_playing: (_updateData$now_playi = updateData.now_playing_video) === null || _updateData$now_playi === void 0 ? void 0 : _updateData$now_playi.title,
                is_playing: updateData.is_playing,
                queue_length: (_updateData$active_qu = updateData.active_queue) === null || _updateData$active_qu === void 0 ? void 0 : _updateData$active_qu.length,
                queue_index: updateData.queue_index,
                priority_length: (_updateData$priority_ = updateData.priority_queue) === null || _updateData$priority_ === void 0 ? void 0 : _updateData$priority_.length
              });
              if (!(this.lastSyncKey === updateKey)) {
                _context5.n = 3;
                break;
              }
              return _context5.a(2);
            case 3:
              this.lastSyncKey = updateKey;
              console.log('[SupabaseService] Syncing state to Supabase:', {
                now_playing: (_updateData$now_playi2 = updateData.now_playing_video) === null || _updateData$now_playi2 === void 0 ? void 0 : _updateData$now_playi2.title,
                is_playing: updateData.is_playing,
                queue_length: (_updateData$active_qu2 = updateData.active_queue) === null || _updateData$active_qu2 === void 0 ? void 0 : _updateData$active_qu2.length,
                queue_index: updateData.queue_index,
                priority_length: (_updateData$priority_2 = updateData.priority_queue) === null || _updateData$priority_2 === void 0 ? void 0 : _updateData$priority_2.length
              });
              _context5.n = 4;
              return this.client.from('player_state').update(updateData).eq('id', this.playerStateId);
            case 4:
              _yield$this$client$fr4 = _context5.v;
              error = _yield$this$client$fr4.error;
              if (error) {
                console.error('[SupabaseService] State sync error:', error);
              } else {
                console.log('[SupabaseService] ✅ State synced successfully');
                this.lastSyncedState = updateData;
              }
              _context5.n = 6;
              break;
            case 5:
              _context5.p = 5;
              _t2 = _context5.v;
              console.error('[SupabaseService] State sync exception:', _t2);
            case 6:
              return _context5.a(2);
          }
        }, _callee5, this, [[1, 5]]);
      }));
      function performStateSync(_x3) {
        return _performStateSync.apply(this, arguments);
      }
      return performStateSync;
    }() // ==================== Command Handling ====================
    /**
     * Start listening for remote commands using Broadcast channels
     *
     * Uses Supabase Broadcast (not postgres_changes) because:
     * 1. No database Realtime replication config needed
     * 2. Instant delivery - no database round-trip
     * 3. More reliable - simple pub/sub pattern
     */
    )
  }, {
    key: "startCommandListener",
    value: function () {
      var _startCommandListener = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8() {
        var _this3 = this;
        return _regenerator().w(function (_context8) {
          while (1) switch (_context8.n) {
            case 0:
              if (this.client) {
                _context8.n = 1;
                break;
              }
              throw new Error('Client not initialized');
            case 1:
              console.log("[SupabaseService] Setting up Broadcast command listener for player: ".concat(this.playerId));
              // Use Broadcast channel for instant command delivery
              // Channel name includes player ID so each player gets its own channel
              this.commandChannel = this.client.channel("djamms-commands:".concat(this.playerId)).on('broadcast', {
                event: 'command'
              }, /*#__PURE__*/function () {
                var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(payload) {
                  var message, command;
                  return _regenerator().w(function (_context6) {
                    while (1) switch (_context6.n) {
                      case 0:
                        message = payload.payload;
                        if (!(!message || !message.command)) {
                          _context6.n = 1;
                          break;
                        }
                        console.warn('[SupabaseService] Received invalid broadcast message:', payload);
                        return _context6.a(2);
                      case 1:
                        command = message.command;
                        console.log('[SupabaseService] 📥 Received command via Broadcast:', command.command_type, command.id);
                        // Process the command
                        _context6.n = 2;
                        return _this3.processCommand(command);
                      case 2:
                        return _context6.a(2);
                    }
                  }, _callee6);
                }));
                return function (_x4) {
                  return _ref.apply(this, arguments);
                };
              }()).subscribe(function (status, err) {
                if (status === 'SUBSCRIBED') {
                  console.log('[SupabaseService] ✅ Broadcast command listener SUBSCRIBED - ready to receive commands');
                } else if (status === 'CHANNEL_ERROR') {
                  console.error('[SupabaseService] ❌ Broadcast channel ERROR:', err);
                } else if (status === 'TIMED_OUT') {
                  console.warn('[SupabaseService] ⚠️ Broadcast channel TIMED_OUT');
                } else {
                  console.log("[SupabaseService] Broadcast channel status: ".concat(status));
                }
              });
              // Delay initial pending commands check to let Broadcast handle immediate delivery
              // Reduced from 3s to 500ms - deduplication prevents race conditions
              setTimeout(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7() {
                return _regenerator().w(function (_context7) {
                  while (1) switch (_context7.n) {
                    case 0:
                      _context7.n = 1;
                      return _this3.processPendingCommands();
                    case 1:
                      return _context7.a(2);
                  }
                }, _callee7);
              })), 500);
              // Start periodic poll as fallback with minimal delay
              // This is a safety net in case Broadcast misses messages
              setTimeout(function () {
                return _this3.startCommandPoll();
              }, 1000);
            case 2:
              return _context8.a(2);
          }
        }, _callee8, this);
      }));
      function startCommandListener() {
        return _startCommandListener.apply(this, arguments);
      }
      return startCommandListener;
    }()
    /**
     * Start periodic polling for pending commands as a fallback mechanism
     * This is a safety net in case Broadcast messages are missed
     */
  }, {
    key: "startCommandPoll",
    value: function startCommandPoll() {
      var _this4 = this;
      // Poll every 2 seconds for faster fallback recovery on disconnect
      this.commandPollInterval = setInterval(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9() {
        return _regenerator().w(function (_context9) {
          while (1) switch (_context9.n) {
            case 0:
              _context9.n = 1;
              return _this4.processPendingCommands();
            case 1:
              return _context9.a(2);
          }
        }, _callee9);
      })), 2000);
    }
    /**
     * Process any pending commands (catch-up after reconnect)
     */
  }, {
    key: "processPendingCommands",
    value: (function () {
      var _processPendingCommands = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee0() {
        var _this5 = this;
        var expiryTime, _yield$this$client$fr5, pendingCommands, error, newCommands, _iterator, _step, command, staleCommands, staleIds, _t3;
        return _regenerator().w(function (_context0) {
          while (1) switch (_context0.p = _context0.n) {
            case 0:
              if (this.client) {
                _context0.n = 1;
                break;
              }
              return _context0.a(2);
            case 1:
              expiryTime = new Date(Date.now() - COMMAND_EXPIRY_MS).toISOString();
              _context0.n = 2;
              return this.client.from('admin_commands').select('*').eq('player_id', this.playerId).eq('status', 'pending').gt('created_at', expiryTime).order('created_at', {
                ascending: true
              });
            case 2:
              _yield$this$client$fr5 = _context0.v;
              pendingCommands = _yield$this$client$fr5.data;
              error = _yield$this$client$fr5.error;
              if (!error) {
                _context0.n = 3;
                break;
              }
              console.error('[SupabaseService] Error fetching pending commands:', error);
              return _context0.a(2);
            case 3:
              if (!(pendingCommands && pendingCommands.length > 0)) {
                _context0.n = 11;
                break;
              }
              // Filter out commands we've already processed (prevents log spam)
              newCommands = pendingCommands.filter(function (cmd) {
                return !_this5.processedCommandIds.has(cmd.id);
              });
              if (!(newCommands.length > 0)) {
                _context0.n = 10;
                break;
              }
              console.log("[SupabaseService] Processing ".concat(newCommands.length, " pending commands"));
              _iterator = _createForOfIteratorHelper(newCommands);
              _context0.p = 4;
              _iterator.s();
            case 5:
              if ((_step = _iterator.n()).done) {
                _context0.n = 7;
                break;
              }
              command = _step.value;
              _context0.n = 6;
              return this.processCommand(command);
            case 6:
              _context0.n = 5;
              break;
            case 7:
              _context0.n = 9;
              break;
            case 8:
              _context0.p = 8;
              _t3 = _context0.v;
              _iterator.e(_t3);
            case 9:
              _context0.p = 9;
              _iterator.f();
              return _context0.f(9);
            case 10:
              // Clean up stale commands that are stuck in 'pending' but we've already processed
              // This handles the case where the status update failed
              staleCommands = pendingCommands.filter(function (cmd) {
                return _this5.processedCommandIds.has(cmd.id);
              });
              if (staleCommands.length > 0) {
                // Batch update all stale commands to 'executed' status
                staleIds = staleCommands.map(function (cmd) {
                  return cmd.id;
                });
                this.client.from('admin_commands').update({
                  status: 'executed',
                  executed_at: new Date().toISOString()
                })["in"]('id', staleIds).then(function (_ref4) {
                  var updateError = _ref4.error;
                  if (updateError) {
                    console.warn('[SupabaseService] Error cleaning up stale commands:', updateError.message);
                  } else {
                    console.log("[SupabaseService] \uD83E\uDDF9 Cleaned up ".concat(staleIds.length, " stale commands"));
                  }
                });
              }
            case 11:
              return _context0.a(2);
          }
        }, _callee0, this, [[4, 8, 9, 10]]);
      }));
      function processPendingCommands() {
        return _processPendingCommands.apply(this, arguments);
      }
      return processPendingCommands;
    }()
    /**
     * Process a single command with deduplication
     * Ensures each command is only processed ONCE, even if received via both Broadcast and polling
     */
    )
  }, {
    key: "processCommand",
    value: (function () {
      var _processCommand = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee1(command) {
        var idsArray, handlers, _t4;
        return _regenerator().w(function (_context1) {
          while (1) switch (_context1.p = _context1.n) {
            case 0:
              if (!this.processedCommandIds.has(command.id)) {
                _context1.n = 1;
                break;
              }
              return _context1.a(2);
            case 1:
              if (!this.processingCommandIds.has(command.id)) {
                _context1.n = 2;
                break;
              }
              return _context1.a(2);
            case 2:
              // Mark as being processed BEFORE executing to prevent race conditions
              this.processingCommandIds.add(command.id);
              this.processedCommandIds.add(command.id);
              // Prevent memory leak - keep only last 500 command IDs
              if (this.processedCommandIds.size > 1000) {
                idsArray = Array.from(this.processedCommandIds);
                this.processedCommandIds = new Set(idsArray.slice(-500));
              }
              handlers = this.commandHandlers.get(command.command_type);
              _context1.p = 3;
              if (!(handlers && handlers.length > 0)) {
                _context1.n = 5;
                break;
              }
              console.log("[SupabaseService] \u2699\uFE0F Executing command: ".concat(command.command_type, " (").concat(command.id, ")"));
              // Execute only the FIRST handler to prevent duplicate actions from multiple registrations
              _context1.n = 4;
              return handlers[0](command);
            case 4:
              console.log("[SupabaseService] \u2705 Command executed: ".concat(command.command_type));
              _context1.n = 6;
              break;
            case 5:
              console.warn("[SupabaseService] \u26A0\uFE0F No handler for command type: ".concat(command.command_type));
            case 6:
              // Mark command as executed in database (fire-and-forget)
              this.markCommandExecuted(command.id, true);
              _context1.n = 8;
              break;
            case 7:
              _context1.p = 7;
              _t4 = _context1.v;
              console.error("[SupabaseService] \u274C Error processing command ".concat(command.id, ":"), _t4);
              this.markCommandExecuted(command.id, false, String(_t4));
            case 8:
              _context1.p = 8;
              // Remove from processing set (but keep in processed set to prevent re-execution)
              this.processingCommandIds["delete"](command.id);
              return _context1.f(8);
            case 9:
              return _context1.a(2);
          }
        }, _callee1, this, [[3, 7, 8, 9]]);
      }));
      function processCommand(_x5) {
        return _processCommand.apply(this, arguments);
      }
      return processCommand;
    }()
    /**
     * Mark a command as executed or failed
     * Updates database status for audit trail (fire-and-forget, non-blocking)
     */
    )
  }, {
    key: "markCommandExecuted",
    value: function markCommandExecuted(commandId, success, errorMessage) {
      if (!this.client) return;
      console.log("[SupabaseService] \uD83D\uDCDD Marking command ".concat(commandId, " as ").concat(success ? 'executed' : 'failed'));
      // Update database (fire-and-forget for minimal latency)
      this.client.from('admin_commands').update({
        status: success ? 'executed' : 'failed',
        executed_at: new Date().toISOString(),
        execution_result: success ? {
          success: true
        } : {
          error: errorMessage
        }
      }).eq('id', commandId).then(function (_ref5) {
        var error = _ref5.error;
        if (error) {
          console.warn('[SupabaseService] Error marking command as executed:', error.message);
        }
      });
    }
    /**
     * Register a handler for a specific command type
     */
  }, {
    key: "onCommand",
    value: function onCommand(type, handler) {
      var existing = this.commandHandlers.get(type) || [];
      this.commandHandlers.set(type, [].concat(_toConsumableArray(existing), [handler]));
    }
    /**
     * Remove a command handler
     */
  }, {
    key: "offCommand",
    value: function offCommand(type, handler) {
      var existing = this.commandHandlers.get(type) || [];
      this.commandHandlers.set(type, existing.filter(function (h) {
        return h !== handler;
      }));
    }
    /**
     * Send a command to a player (for Admin Console use)
     * Inserts to database for persistence and broadcasts for instant delivery
     */
  }, {
    key: "sendCommand",
    value: (function () {
      var _sendCommand = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee10(targetPlayerId, commandType, payload) {
        var source,
          _yield$this$client$fr6,
          data,
          error,
          commandId,
          commandChannel,
          command,
          _args10 = arguments,
          _t5;
        return _regenerator().w(function (_context10) {
          while (1) switch (_context10.p = _context10.n) {
            case 0:
              source = _args10.length > 3 && _args10[3] !== undefined ? _args10[3] : 'electron-admin';
              if (this.client) {
                _context10.n = 1;
                break;
              }
              console.warn('[SupabaseService] Cannot send command - not initialized');
              return _context10.a(2, {
                success: false,
                error: 'Not initialized'
              });
            case 1:
              console.log("[SupabaseService] \uD83D\uDCE4 Sending command: ".concat(commandType, " to player: ").concat(targetPlayerId));
              // 1. Insert to database for persistence/audit
              _context10.n = 2;
              return this.client.from('admin_commands').insert({
                player_id: targetPlayerId,
                command_type: commandType,
                payload: payload || {},
                source: source,
                status: 'pending'
              }).select('id').single();
            case 2:
              _yield$this$client$fr6 = _context10.v;
              data = _yield$this$client$fr6.data;
              error = _yield$this$client$fr6.error;
              if (!error) {
                _context10.n = 3;
                break;
              }
              console.error('[SupabaseService] Error sending command:', error);
              return _context10.a(2, {
                success: false,
                error: error.message
              });
            case 3:
              // 2. Broadcast for instant delivery
              commandId = data.id;
              _context10.p = 4;
              commandChannel = this.client.channel("djamms-commands:".concat(targetPlayerId));
              _context10.n = 5;
              return commandChannel.subscribe();
            case 5:
              command = {
                id: commandId,
                player_id: targetPlayerId,
                command_type: commandType,
                command_data: payload || {},
                issued_by: source,
                issued_at: new Date().toISOString(),
                executed_at: null,
                status: 'pending',
                execution_result: null,
                created_at: new Date().toISOString()
              };
              _context10.n = 6;
              return commandChannel.send({
                type: 'broadcast',
                event: 'command',
                payload: {
                  command: command,
                  timestamp: new Date().toISOString()
                }
              });
            case 6:
              commandChannel.unsubscribe();
              _context10.n = 8;
              break;
            case 7:
              _context10.p = 7;
              _t5 = _context10.v;
              console.warn('[SupabaseService] Broadcast failed (command still in DB):', _t5);
            case 8:
              console.log("[SupabaseService] \u2705 Command sent: ".concat(commandType, " (").concat(commandId, ")"));
              return _context10.a(2, {
                success: true,
                commandId: commandId
              });
          }
        }, _callee10, this, [[4, 7]]);
      }));
      function sendCommand(_x6, _x7, _x8) {
        return _sendCommand.apply(this, arguments);
      }
      return sendCommand;
    }()
    /**
     * Get the current player ID
     */
    )
  }, {
    key: "getPlayerId",
    value: function getPlayerId() {
      return this.playerId;
    }
    // ==================== Heartbeat ====================
    /**
     * Start the heartbeat interval
     */
  }, {
    key: "startHeartbeat",
    value: function startHeartbeat() {
      var _this6 = this;
      this.heartbeatInterval = setInterval(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee11() {
        return _regenerator().w(function (_context11) {
          while (1) switch (_context11.n) {
            case 0:
              _context11.n = 1;
              return _this6.sendHeartbeat();
            case 1:
              return _context11.a(2);
          }
        }, _callee11);
      })), HEARTBEAT_INTERVAL);
      // Send initial heartbeat
      this.sendHeartbeat();
    }
    /**
     * Send a heartbeat to update last_heartbeat timestamp
     */
  }, {
    key: "sendHeartbeat",
    value: (function () {
      var _sendHeartbeat = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee12() {
        var _yield$this$client$fr7, error;
        return _regenerator().w(function (_context12) {
          while (1) switch (_context12.n) {
            case 0:
              if (!(!this.client || !this.playerStateId)) {
                _context12.n = 1;
                break;
              }
              return _context12.a(2);
            case 1:
              _context12.n = 2;
              return this.client.from('player_state').update({
                last_heartbeat: new Date().toISOString(),
                is_online: true
              }).eq('id', this.playerStateId);
            case 2:
              _yield$this$client$fr7 = _context12.v;
              error = _yield$this$client$fr7.error;
              if (error) {
                console.error('[SupabaseService] Heartbeat error:', error);
              }
            case 3:
              return _context12.a(2);
          }
        }, _callee12, this);
      }));
      function sendHeartbeat() {
        return _sendHeartbeat.apply(this, arguments);
      }
      return sendHeartbeat;
    }() // ==================== Local Video Indexing ====================
    /**
     * Index local videos to the local_videos Supabase table
     * This allows Admin Console and Kiosk to search the player's local library
     *
     * @param playlists - Object mapping playlist names to video arrays
     */
    )
  }, {
    key: "indexLocalVideos",
    value: function () {
      var _indexLocalVideos = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee13(playlists) {
        var _this7 = this;
        var allVideosRaw, _i, _Object$values, videos, seen, allVideos, _yield$this$client$fr8, deleteError, localVideoRecords, batchSize, insertedCount, i, batch, _yield$this$client$fr9, insertError, _t6;
        return _regenerator().w(function (_context13) {
          while (1) switch (_context13.p = _context13.n) {
            case 0:
              if (!(!this.client || !this.playerId)) {
                _context13.n = 1;
                break;
              }
              console.warn('[SupabaseService] Cannot index videos - not initialized');
              return _context13.a(2);
            case 1:
              _context13.p = 1;
              // Flatten all videos from all playlists and deduplicate by path
              allVideosRaw = [];
              for (_i = 0, _Object$values = Object.values(playlists); _i < _Object$values.length; _i++) {
                videos = _Object$values[_i];
                allVideosRaw.push.apply(allVideosRaw, _toConsumableArray(videos));
              }
              // Deduplicate by path (same video may appear in multiple playlists)
              seen = new Set();
              allVideos = allVideosRaw.filter(function (video) {
                var key = video.path || video.file_path || video.src || "".concat(video.title, "|").concat(video.artist);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              if (!(allVideos.length === 0)) {
                _context13.n = 2;
                break;
              }
              console.log('[SupabaseService] No videos to index');
              return _context13.a(2);
            case 2:
              console.log("[SupabaseService] Indexing ".concat(allVideos.length, " unique local videos (").concat(allVideosRaw.length - allVideos.length, " duplicates removed)..."));
              // First, delete existing entries for this player (clean slate)
              _context13.n = 3;
              return this.client.from('local_videos')["delete"]().eq('player_id', this.playerId);
            case 3:
              _yield$this$client$fr8 = _context13.v;
              deleteError = _yield$this$client$fr8.error;
              if (deleteError) {
                console.error('[SupabaseService] Error clearing existing videos:', deleteError);
                // Continue anyway - we'll upsert
              }
              // Convert videos to Supabase format
              localVideoRecords = allVideos.map(function (video) {
                return {
                  player_id: _this7.playerId,
                  title: video.title,
                  artist: video.artist || null,
                  path: video.path || video.file_path || video.src,
                  duration: video.duration || null,
                  is_available: true,
                  metadata: {
                    sourceType: 'local',
                    playlist: video.playlist,
                    playlistDisplayName: video.playlistDisplayName,
                    filename: video.filename
                  }
                };
              }); // Insert in batches of 100 to avoid payload limits
              batchSize = 100;
              insertedCount = 0;
              i = 0;
            case 4:
              if (!(i < localVideoRecords.length)) {
                _context13.n = 7;
                break;
              }
              batch = localVideoRecords.slice(i, i + batchSize);
              _context13.n = 5;
              return this.client.from('local_videos').insert(batch);
            case 5:
              _yield$this$client$fr9 = _context13.v;
              insertError = _yield$this$client$fr9.error;
              if (insertError) {
                console.error("[SupabaseService] Error inserting batch ".concat(i / batchSize + 1, ":"), insertError);
              } else {
                insertedCount += batch.length;
              }
            case 6:
              i += batchSize;
              _context13.n = 4;
              break;
            case 7:
              console.log("[SupabaseService] Indexed ".concat(insertedCount, "/").concat(allVideos.length, " videos"));
              _context13.n = 9;
              break;
            case 8:
              _context13.p = 8;
              _t6 = _context13.v;
              console.error('[SupabaseService] Video indexing exception:', _t6);
            case 9:
              return _context13.a(2);
          }
        }, _callee13, this, [[1, 8]]);
      }));
      function indexLocalVideos(_x9) {
        return _indexLocalVideos.apply(this, arguments);
      }
      return indexLocalVideos;
    }()
    /**
     * Mark a video as unavailable (file deleted/moved)
     */
  }, {
    key: "markVideoUnavailable",
    value: (function () {
      var _markVideoUnavailable = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee14(path) {
        var _yield$this$client$fr0, error;
        return _regenerator().w(function (_context14) {
          while (1) switch (_context14.n) {
            case 0:
              if (this.client) {
                _context14.n = 1;
                break;
              }
              return _context14.a(2);
            case 1:
              _context14.n = 2;
              return this.client.from('local_videos').update({
                is_available: false
              }).eq('player_id', this.playerId).eq('path', path);
            case 2:
              _yield$this$client$fr0 = _context14.v;
              error = _yield$this$client$fr0.error;
              if (error) {
                console.error('[SupabaseService] Error marking video unavailable:', error);
              }
            case 3:
              return _context14.a(2);
          }
        }, _callee14, this);
      }));
      function markVideoUnavailable(_x0) {
        return _markVideoUnavailable.apply(this, arguments);
      }
      return markVideoUnavailable;
    }() // ==================== Search & Browse (PostgreSQL Full-Text Search) ====================
    /**
     * Search videos using PostgreSQL full-text search
     * @param query - Search query string
     * @param scope - 'all' | 'karaoke' | 'no-karaoke'
     * @param limit - Max results (default 100)
     * @param offset - Pagination offset (default 0)
     */
    )
  }, {
    key: "searchVideos",
    value: function () {
      var _searchVideos = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee15(query) {
        var scope,
          limit,
          offset,
          _yield$this$client$rp,
          data,
          error,
          _args15 = arguments,
          _t7;
        return _regenerator().w(function (_context15) {
          while (1) switch (_context15.p = _context15.n) {
            case 0:
              scope = _args15.length > 1 && _args15[1] !== undefined ? _args15[1] : 'all';
              limit = _args15.length > 2 && _args15[2] !== undefined ? _args15[2] : 100;
              offset = _args15.length > 3 && _args15[3] !== undefined ? _args15[3] : 0;
              if (this.client) {
                _context15.n = 1;
                break;
              }
              console.error('[SupabaseService] Client not initialized for search');
              return _context15.a(2, []);
            case 1:
              _context15.p = 1;
              _context15.n = 2;
              return this.client.rpc('search_videos', {
                search_query: query,
                scope: scope,
                result_limit: limit,
                result_offset: offset
              });
            case 2:
              _yield$this$client$rp = _context15.v;
              data = _yield$this$client$rp.data;
              error = _yield$this$client$rp.error;
              if (!error) {
                _context15.n = 3;
                break;
              }
              console.error('[SupabaseService] Search error:', error);
              return _context15.a(2, []);
            case 3:
              return _context15.a(2, (data || []).map(function (row) {
                return {
                  id: row.id,
                  title: row.title,
                  artist: row.artist,
                  path: row.path,
                  src: row.path,
                  // Use path as src for local files
                  playlist: row.playlist,
                  playlistDisplayName: row.playlist_display_name,
                  duration: row.duration
                };
              }));
            case 4:
              _context15.p = 4;
              _t7 = _context15.v;
              console.error('[SupabaseService] Search exception:', _t7);
              return _context15.a(2, []);
          }
        }, _callee15, this, [[1, 4]]);
      }));
      function searchVideos(_x1) {
        return _searchVideos.apply(this, arguments);
      }
      return searchVideos;
    }()
    /**
     * Browse videos with sorting and filtering
     * @param scope - 'all' | 'karaoke' | 'no-karaoke'
     * @param sortBy - 'title' | 'artist' | 'playlist'
     * @param sortDir - 'asc' | 'desc'
     * @param limit - Max results (default 100)
     * @param offset - Pagination offset (default 0)
     */
  }, {
    key: "browseVideos",
    value: (function () {
      var _browseVideos = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee16() {
        var scope,
          sortBy,
          sortDir,
          limit,
          offset,
          _yield$this$client$rp2,
          data,
          error,
          _args16 = arguments,
          _t8;
        return _regenerator().w(function (_context16) {
          while (1) switch (_context16.p = _context16.n) {
            case 0:
              scope = _args16.length > 0 && _args16[0] !== undefined ? _args16[0] : 'all';
              sortBy = _args16.length > 1 && _args16[1] !== undefined ? _args16[1] : 'title';
              sortDir = _args16.length > 2 && _args16[2] !== undefined ? _args16[2] : 'asc';
              limit = _args16.length > 3 && _args16[3] !== undefined ? _args16[3] : 100;
              offset = _args16.length > 4 && _args16[4] !== undefined ? _args16[4] : 0;
              if (this.client) {
                _context16.n = 1;
                break;
              }
              console.error('[SupabaseService] Client not initialized for browse');
              return _context16.a(2, []);
            case 1:
              _context16.p = 1;
              _context16.n = 2;
              return this.client.rpc('browse_videos', {
                scope: scope,
                sort_by: sortBy,
                sort_dir: sortDir,
                result_limit: limit,
                result_offset: offset
              });
            case 2:
              _yield$this$client$rp2 = _context16.v;
              data = _yield$this$client$rp2.data;
              error = _yield$this$client$rp2.error;
              if (!error) {
                _context16.n = 3;
                break;
              }
              console.error('[SupabaseService] Browse error:', error);
              return _context16.a(2, []);
            case 3:
              return _context16.a(2, (data || []).map(function (row) {
                return {
                  id: row.id,
                  title: row.title,
                  artist: row.artist,
                  path: row.path,
                  src: row.path,
                  // Use path as src for local files
                  playlist: row.playlist,
                  playlistDisplayName: row.playlist_display_name,
                  duration: row.duration
                };
              }));
            case 4:
              _context16.p = 4;
              _t8 = _context16.v;
              console.error('[SupabaseService] Browse exception:', _t8);
              return _context16.a(2, []);
          }
        }, _callee16, this, [[1, 4]]);
      }));
      function browseVideos() {
        return _browseVideos.apply(this, arguments);
      }
      return browseVideos;
    }()
    /**
     * Get total video count for pagination
     * @param scope - 'all' | 'karaoke' | 'no-karaoke'
     */
    )
  }, {
    key: "countVideos",
    value: (function () {
      var _countVideos = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee17() {
        var scope,
          _yield$this$client$rp3,
          data,
          error,
          _args17 = arguments,
          _t9;
        return _regenerator().w(function (_context17) {
          while (1) switch (_context17.p = _context17.n) {
            case 0:
              scope = _args17.length > 0 && _args17[0] !== undefined ? _args17[0] : 'all';
              if (this.client) {
                _context17.n = 1;
                break;
              }
              return _context17.a(2, 0);
            case 1:
              _context17.p = 1;
              _context17.n = 2;
              return this.client.rpc('count_videos', {
                scope: scope
              });
            case 2:
              _yield$this$client$rp3 = _context17.v;
              data = _yield$this$client$rp3.data;
              error = _yield$this$client$rp3.error;
              if (!error) {
                _context17.n = 3;
                break;
              }
              console.error('[SupabaseService] Count error:', error);
              return _context17.a(2, 0);
            case 3:
              return _context17.a(2, data || 0);
            case 4:
              _context17.p = 4;
              _t9 = _context17.v;
              console.error('[SupabaseService] Count exception:', _t9);
              return _context17.a(2, 0);
          }
        }, _callee17, this, [[1, 4]]);
      }));
      function countVideos() {
        return _countVideos.apply(this, arguments);
      }
      return countVideos;
    }() // ==================== Utility Methods ====================
    /**
     * Convert local Video type to NowPlayingVideo
     */
    )
  }, {
    key: "videoToNowPlaying",
    value: function videoToNowPlaying(video) {
      return {
        id: video.id,
        src: video.src,
        path: video.path || video.file_path || video.src,
        title: video.title,
        artist: video.artist || null,
        sourceType: video.src.startsWith('http') ? 'youtube' : 'local',
        duration: video.duration
      };
    }
    /**
     * Convert local Video type to QueueVideoItem
     */
  }, {
    key: "videoToQueueItem",
    value: function videoToQueueItem(video) {
      return {
        id: video.id,
        src: video.src,
        path: video.path || video.file_path || video.src,
        title: video.title,
        artist: video.artist || null,
        sourceType: video.src.startsWith('http') ? 'youtube' : 'local',
        duration: video.duration,
        playlist: video.playlist,
        playlistDisplayName: video.playlistDisplayName
      };
    }
    /**
     * Get helper methods for extracting command payloads
     */
  }, {
    key: "getCommandPayload",
    value: function getCommandPayload(command) {
      return command.command_data;
    }
    // ==================== Public Getters ====================
  }, {
    key: "initialized",
    get: function get() {
      return this.isInitialized;
    }
  }, {
    key: "online",
    get: function get() {
      return this.isOnline;
    }
  }, {
    key: "currentPlayerId",
    get: function get() {
      return this.playerId;
    }
  }, {
    key: "getClient",
    value: function getClient() {
      return this.client;
    }
  }], [{
    key: "getInstance",
    value: function getInstance() {
      if (!SupabaseService.instance) {
        SupabaseService.instance = new SupabaseService();
      }
      return SupabaseService.instance;
    }
  }]);
}();
SupabaseService.instance = null;
// Export singleton instance getter
var getSupabaseService = function getSupabaseService() {
  return SupabaseService.getInstance();
};

var SupabaseService$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    SupabaseService: SupabaseService,
    default: SupabaseService,
    getSupabaseService: getSupabaseService
});

/**
 * QueueService - Manages queue rotation logic
 */
var QueueService = /*#__PURE__*/function () {
  function QueueService() {
    _classCallCheck(this, QueueService);
    this.state = {
      activeQueue: [],
      priorityQueue: [],
      nowPlaying: null,
      nowPlayingSource: null
    };
    // Private constructor for singleton
  }
  /**
   * Get the singleton instance
   */
  return _createClass(QueueService, [{
    key: "initialize",
    value:
    /**
     * Initialize queue with videos
     */
    function initialize(activeQueue) {
      var priorityQueue = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
      this.state = {
        activeQueue: _toConsumableArray(activeQueue),
        priorityQueue: _toConsumableArray(priorityQueue),
        nowPlaying: null,
        nowPlayingSource: null
      };
    }
    /**
     * Set the entire active queue (replaces existing)
     */
  }, {
    key: "setActiveQueue",
    value: function setActiveQueue(videos) {
      this.state.activeQueue = _toConsumableArray(videos);
      this.syncToSupabase();
    }
    /**
     * Set the entire priority queue (replaces existing)
     */
  }, {
    key: "setPriorityQueue",
    value: function setPriorityQueue(videos) {
      this.state.priorityQueue = _toConsumableArray(videos);
      this.syncToSupabase();
    }
    /**
     * Add a video to the active queue
     */
  }, {
    key: "addToActiveQueue",
    value: function addToActiveQueue(video, position) {
      if (position !== undefined && position >= 0 && position <= this.state.activeQueue.length) {
        this.state.activeQueue.splice(position, 0, video);
      } else {
        this.state.activeQueue.push(video);
      }
      this.syncToSupabase();
    }
    /**
     * Add a video to the priority queue
     * @param video - Video to add
     * @param user - Optional user/kiosk identifier who requested
     */
  }, {
    key: "addToPriorityQueue",
    value: function addToPriorityQueue(video, user) {
      var priorityVideo = _objectSpread2(_objectSpread2({}, video), {}, {
        requestedBy: user // Store who requested it
      });
      this.state.priorityQueue.push(priorityVideo);
      this.syncToSupabase();
    }
    /**
     * Remove a video from the active queue by index
     */
  }, {
    key: "removeFromActiveQueue",
    value: function removeFromActiveQueue(index) {
      if (index >= 0 && index < this.state.activeQueue.length) {
        var _this$state$activeQue = this.state.activeQueue.splice(index, 1),
          _this$state$activeQue2 = _slicedToArray(_this$state$activeQue, 1),
          removed = _this$state$activeQue2[0];
        this.syncToSupabase();
        return removed;
      }
      return null;
    }
    /**
     * Remove a video from the priority queue by index
     */
  }, {
    key: "removeFromPriorityQueue",
    value: function removeFromPriorityQueue(index) {
      if (index >= 0 && index < this.state.priorityQueue.length) {
        var _this$state$priorityQ = this.state.priorityQueue.splice(index, 1),
          _this$state$priorityQ2 = _slicedToArray(_this$state$priorityQ, 1),
          removed = _this$state$priorityQ2[0];
        this.syncToSupabase();
        return removed;
      }
      return null;
    }
    /**
     * Clear the active queue
     */
  }, {
    key: "clearActiveQueue",
    value: function clearActiveQueue() {
      this.state.activeQueue = [];
      this.syncToSupabase();
    }
    /**
     * Clear the priority queue
     */
  }, {
    key: "clearPriorityQueue",
    value: function clearPriorityQueue() {
      this.state.priorityQueue = [];
      this.syncToSupabase();
    }
    /**
     * Shuffle the active queue
     * @param keepFirst - If true, keeps the first item in place (current playing)
     */
  }, {
    key: "shuffleActiveQueue",
    value: function shuffleActiveQueue() {
      var keepFirst = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
      if (this.state.activeQueue.length <= 1) return;
      if (keepFirst) {
        var first = this.state.activeQueue[0];
        var rest = this.state.activeQueue.slice(1);
        this.shuffleArray(rest);
        this.state.activeQueue = [first].concat(_toConsumableArray(rest));
      } else {
        this.shuffleArray(this.state.activeQueue);
      }
      this.syncToSupabase();
    }
    /**
     * Get the next video to play (peek without rotating)
     */
  }, {
    key: "peekNext",
    value: function peekNext() {
      // Priority queue takes precedence
      if (this.state.priorityQueue.length > 0) {
        return {
          video: this.state.priorityQueue[0],
          source: 'priority'
        };
      }
      // Fall back to active queue
      if (this.state.activeQueue.length > 0) {
        return {
          video: this.state.activeQueue[0],
          source: 'active'
        };
      }
      return {
        video: null,
        source: null
      };
    }
    /**
     * Rotate the queue - get next video and update state
     *
     * Logic:
     * 1. If priority queue has items -> play from priority (no recycle)
     * 2. If only active queue -> play from active, recycle to end
     * 3. Update nowPlaying state
     */
  }, {
    key: "rotateQueue",
    value: function rotateQueue() {
      var nextVideo = null;
      var source = null;
      // First, recycle the previous "now playing" if it was from active queue
      if (this.state.nowPlaying && this.state.nowPlayingSource === 'active') {
        // Move finished video to the END of active queue (recycle)
        this.state.activeQueue.push(this.state.nowPlaying);
      }
      // Note: Priority queue items are NOT recycled
      // Check priority queue first
      if (this.state.priorityQueue.length > 0) {
        nextVideo = this.state.priorityQueue.shift() || null;
        source = 'priority';
      }
      // Fall back to active queue
      else if (this.state.activeQueue.length > 0) {
        nextVideo = this.state.activeQueue.shift() || null;
        source = 'active';
      }
      // Update state
      this.state.nowPlaying = nextVideo;
      this.state.nowPlayingSource = source;
      // Sync to Supabase
      this.syncToSupabase();
      return {
        nextVideo: nextVideo,
        source: source,
        newState: this.getState()
      };
    }
    /**
     * Start playback (initial video without rotation)
     */
  }, {
    key: "startPlayback",
    value: function startPlayback() {
      // Don't recycle on initial start - just get the first video
      var nextVideo = null;
      var source = null;
      // Check priority queue first
      if (this.state.priorityQueue.length > 0) {
        nextVideo = this.state.priorityQueue.shift() || null;
        source = 'priority';
      }
      // Fall back to active queue
      else if (this.state.activeQueue.length > 0) {
        nextVideo = this.state.activeQueue.shift() || null;
        source = 'active';
      }
      // Update state
      this.state.nowPlaying = nextVideo;
      this.state.nowPlayingSource = source;
      // Sync to Supabase
      this.syncToSupabase();
      return {
        nextVideo: nextVideo,
        source: source,
        newState: this.getState()
      };
    }
    /**
     * Get current queue state (immutable copy)
     */
  }, {
    key: "getState",
    value: function getState() {
      return {
        activeQueue: _toConsumableArray(this.state.activeQueue),
        priorityQueue: _toConsumableArray(this.state.priorityQueue),
        nowPlaying: this.state.nowPlaying ? _objectSpread2({}, this.state.nowPlaying) : null,
        nowPlayingSource: this.state.nowPlayingSource
      };
    }
    /**
     * Get active queue length
     */
  }, {
    key: "activeQueueLength",
    get: function get() {
      return this.state.activeQueue.length;
    }
    /**
     * Get priority queue length
     */
  }, {
    key: "priorityQueueLength",
    get: function get() {
      return this.state.priorityQueue.length;
    }
    /**
     * Get total queue length (active + priority)
     */
  }, {
    key: "totalQueueLength",
    get: function get() {
      return this.state.activeQueue.length + this.state.priorityQueue.length;
    }
    /**
     * Get currently playing video
     */
  }, {
    key: "currentVideo",
    get: function get() {
      return this.state.nowPlaying;
    }
    // ==================== Private Helpers ====================
    /**
     * Shuffle array in place (Fisher-Yates algorithm)
     */
  }, {
    key: "shuffleArray",
    value: function shuffleArray(array) {
      for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var _ref = [array[j], array[i]];
        array[i] = _ref[0];
        array[j] = _ref[1];
      }
    }
    /**
     * Sync current state to Supabase
     */
  }, {
    key: "syncToSupabase",
    value: function syncToSupabase() {
      var supabaseService = getSupabaseService();
      if (supabaseService.initialized) {
        supabaseService.syncPlayerState({
          currentVideo: this.state.nowPlaying,
          activeQueue: this.state.activeQueue,
          priorityQueue: this.state.priorityQueue
        });
      }
    }
  }], [{
    key: "getInstance",
    value: function getInstance() {
      if (!QueueService.instance) {
        QueueService.instance = new QueueService();
      }
      return QueueService.instance;
    }
  }]);
}();
QueueService.instance = null;
// Export singleton getter
var getQueueService = function getQueueService() {
  return QueueService.getInstance();
};

function useSupabase() {
  var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var playerId = options.playerId,
    _options$autoInit = options.autoInit,
    autoInit = _options$autoInit === void 0 ? true : _options$autoInit,
    onPlay = options.onPlay,
    onPause = options.onPause,
    onResume = options.onResume,
    onSkip = options.onSkip,
    onSetVolume = options.onSetVolume,
    onSeekTo = options.onSeekTo,
    onQueueAdd = options.onQueueAdd,
    onQueueShuffle = options.onQueueShuffle,
    onLoadPlaylist = options.onLoadPlaylist,
    onQueueMove = options.onQueueMove,
    onQueueRemove = options.onQueueRemove,
    onPlayerWindowToggle = options.onPlayerWindowToggle,
    onPlayerFullscreenToggle = options.onPlayerFullscreenToggle,
    onPlayerRefresh = options.onPlayerRefresh,
    onOverlaySettingsUpdate = options.onOverlaySettingsUpdate,
    onKioskSettingsUpdate = options.onKioskSettingsUpdate;
  var _useState = React.useState(false),
    _useState2 = _slicedToArray(_useState, 2),
    isInitialized = _useState2[0],
    setIsInitialized = _useState2[1];
  var _useState3 = React.useState(false),
    _useState4 = _slicedToArray(_useState3, 2),
    isOnline = _useState4[0],
    setIsOnline = _useState4[1];
  var serviceRef = React.useRef(getSupabaseService());
  var handlersRegisteredRef = React.useRef(false);
  // Initialize the service
  var initialize = React.useCallback(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
    var success, _t;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          _context.p = 0;
          _context.n = 1;
          return serviceRef.current.initialize(playerId);
        case 1:
          success = _context.v;
          setIsInitialized(success);
          setIsOnline(success);
          return _context.a(2, success);
        case 2:
          _context.p = 2;
          _t = _context.v;
          console.error('[useSupabase] Initialization error:', _t);
          setIsInitialized(false);
          setIsOnline(false);
          return _context.a(2, false);
      }
    }, _callee, null, [[0, 2]]);
  })), [playerId]);
  // Shutdown the service
  var shutdown = React.useCallback(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          _context2.n = 1;
          return serviceRef.current.shutdown();
        case 1:
          setIsInitialized(false);
          setIsOnline(false);
        case 2:
          return _context2.a(2);
      }
    }, _callee2);
  })), []);
  // Sync state to Supabase
  var syncState = React.useCallback(function (state) {
    var immediate = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    if (serviceRef.current.initialized) {
      serviceRef.current.syncPlayerState(state, immediate);
    }
  }, []);
  // Register command handlers
  React.useEffect(function () {
    if (!isInitialized || handlersRegisteredRef.current) return;
    var service = serviceRef.current;
    // Play command (supports both video object and queueIndex for click-to-play)
    if (onPlay) {
      service.onCommand('play', function (cmd) {
        var payload = cmd.command_data;
        onPlay(payload === null || payload === void 0 ? void 0 : payload.video, payload === null || payload === void 0 ? void 0 : payload.queueIndex);
      });
    }
    // Pause command
    if (onPause) {
      service.onCommand('pause', function () {
        return onPause();
      });
    }
    // Resume command
    if (onResume) {
      service.onCommand('resume', function () {
        return onResume();
      });
    }
    // Skip command
    if (onSkip) {
      service.onCommand('skip', function () {
        return onSkip();
      });
    }
    // Volume command
    if (onSetVolume) {
      service.onCommand('setVolume', function (cmd) {
        var payload = cmd.command_data;
        onSetVolume(payload.volume);
      });
    }
    // Seek command
    if (onSeekTo) {
      service.onCommand('seekTo', function (cmd) {
        var payload = cmd.command_data;
        onSeekTo(payload.position);
      });
    }
    // Queue add command
    if (onQueueAdd) {
      service.onCommand('queue_add', function (cmd) {
        var payload = cmd.command_data;
        onQueueAdd(payload.video, payload.queueType);
      });
    }
    // Queue shuffle command
    if (onQueueShuffle) {
      service.onCommand('queue_shuffle', function () {
        return onQueueShuffle();
      });
    }
    // Load playlist command
    if (onLoadPlaylist) {
      service.onCommand('load_playlist', function (cmd) {
        var payload = cmd.command_data;
        onLoadPlaylist(payload.playlistName, payload.shuffle);
      });
    }
    // Queue move command
    if (onQueueMove) {
      service.onCommand('queue_move', function (cmd) {
        var payload = cmd.command_data;
        onQueueMove(payload.fromIndex, payload.toIndex);
      });
    }
    // Queue remove command
    if (onQueueRemove) {
      service.onCommand('queue_remove', function (cmd) {
        var payload = cmd.command_data;
        onQueueRemove(payload.videoId, payload.queueType);
      });
    }
    // Player window toggle command
    if (onPlayerWindowToggle) {
      service.onCommand('player_window_toggle', function (cmd) {
        var payload = cmd.command_data;
        onPlayerWindowToggle(payload.show);
      });
    }
    // Player fullscreen toggle command
    if (onPlayerFullscreenToggle) {
      service.onCommand('player_fullscreen_toggle', function (cmd) {
        var payload = cmd.command_data;
        onPlayerFullscreenToggle(payload.fullscreen);
      });
    }
    // Player refresh command
    if (onPlayerRefresh) {
      service.onCommand('player_refresh', function () {
        return onPlayerRefresh();
      });
    }
    // Overlay settings update command
    if (onOverlaySettingsUpdate) {
      service.onCommand('overlay_settings_update', function (cmd) {
        var payload = cmd.command_data;
        onOverlaySettingsUpdate(payload.settings);
      });
    }
    // Kiosk settings update command
    if (onKioskSettingsUpdate) {
      service.onCommand('kiosk_settings_update', function (cmd) {
        var payload = cmd.command_data;
        onKioskSettingsUpdate(payload.settings);
      });
    }
    handlersRegisteredRef.current = true;
  }, [isInitialized, onPlay, onPause, onResume, onSkip, onSetVolume, onSeekTo, onQueueAdd, onQueueShuffle, onLoadPlaylist, onQueueMove, onQueueRemove, onPlayerWindowToggle, onPlayerFullscreenToggle, onPlayerRefresh, onOverlaySettingsUpdate, onKioskSettingsUpdate]);
  // Auto-initialize on mount
  React.useEffect(function () {
    if (autoInit) {
      initialize();
    }
    // Cleanup on unmount
    return function () {
      // Note: We don't fully shutdown here as the service is a singleton
      // and may be used by other components. The main app handles final shutdown.
    };
  }, [autoInit, initialize]);
  return {
    isInitialized: isInitialized,
    isOnline: isOnline,
    initialize: initialize,
    shutdown: shutdown,
    syncState: syncState
  };
}

// Navigation items configuration
var navItems = [{
  id: 'queue',
  icon: 'queue_music',
  label: 'Queue'
}, {
  id: 'search',
  icon: 'search',
  label: 'Search'
}, {
  id: 'settings',
  icon: 'settings',
  label: 'Settings'
}, {
  id: 'tools',
  icon: 'build',
  label: 'Tools'
}];
var PlayerIdSetting = function PlayerIdSetting(_ref) {
  var playerId = _ref.playerId,
    onPlayerIdChange = _ref.onPlayerIdChange;
  var _useState = React.useState(false),
    _useState2 = _slicedToArray(_useState, 2),
    isEditing = _useState2[0],
    setIsEditing = _useState2[1];
  var _useState3 = React.useState(''),
    _useState4 = _slicedToArray(_useState3, 2),
    newId = _useState4[0],
    setNewId = _useState4[1];
  var _useState5 = React.useState(null),
    _useState6 = _slicedToArray(_useState5, 2),
    error = _useState6[0],
    setError = _useState6[1];
  var _useState7 = React.useState(false),
    _useState8 = _slicedToArray(_useState7, 2),
    isChanging = _useState8[0],
    setIsChanging = _useState8[1];
  var handleStartEdit = React.useCallback(function () {
    setNewId('');
    setError(null);
    setIsEditing(true);
  }, []);
  var handleCancel = React.useCallback(function () {
    setIsEditing(false);
    setNewId('');
    setError(null);
  }, []);
  var handleSave = React.useCallback(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
    var clean, exists, result;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          clean = newId.trim().toUpperCase();
          if (isValidPlayerIdFormat(clean)) {
            _context.n = 1;
            break;
          }
          setError("Player ID must be at least ".concat(MIN_PLAYER_ID_LENGTH, " characters"));
          return _context.a(2);
        case 1:
          if (!(clean === playerId)) {
            _context.n = 2;
            break;
          }
          setError('This is already your current Player ID');
          return _context.a(2);
        case 2:
          setIsChanging(true);
          setError(null);
          _context.p = 3;
          _context.n = 4;
          return validatePlayerId(clean);
        case 4:
          exists = _context.v;
          if (!exists) {
            _context.n = 5;
            break;
          }
          // ID exists - switch to it
          onPlayerIdChange(clean);
          setIsEditing(false);
          setNewId('');
          _context.n = 7;
          break;
        case 5:
          _context.n = 6;
          return claimPlayerId(clean);
        case 6:
          result = _context.v;
          if (result.success) {
            onPlayerIdChange(clean);
            setIsEditing(false);
            setNewId('');
          } else {
            setError(result.error || 'Failed to claim Player ID');
          }
        case 7:
          _context.n = 9;
          break;
        case 8:
          _context.p = 8;
          _context.v;
          setError('Failed to change Player ID');
        case 9:
          _context.p = 9;
          setIsChanging(false);
          return _context.f(9);
        case 10:
          return _context.a(2);
      }
    }, _callee, null, [[3, 8, 9, 10]]);
  })), [newId, playerId, onPlayerIdChange]);
  if (!isEditing) {
    return /*#__PURE__*/React.createElement("div", {
      className: "setting-item"
    }, /*#__PURE__*/React.createElement("label", null, "Player ID"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'monospace',
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--accent-color)',
        backgroundColor: 'rgba(62, 166, 255, 0.1)',
        padding: '6px 12px',
        borderRadius: '6px',
        letterSpacing: '0.5px'
      }
    }, playerId), /*#__PURE__*/React.createElement("button", {
      className: "action-btn",
      onClick: handleStartEdit
    }, /*#__PURE__*/React.createElement("span", {
      className: "material-symbols-rounded"
    }, "edit"), "Change")), /*#__PURE__*/React.createElement("p", {
      className: "setting-description"
    }, "Unique identifier for this player. Web Admin and Kiosk apps connect using this ID."));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Player ID"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: newId,
    onChange: function onChange(e) {
      setNewId(e.target.value.toUpperCase());
      setError(null);
    },
    placeholder: "Enter new Player ID",
    disabled: isChanging,
    style: {
      padding: '8px 12px',
      fontSize: '14px',
      fontFamily: 'monospace',
      backgroundColor: 'var(--input-bg)',
      color: 'var(--text-primary)',
      border: error ? '1px solid var(--error-color)' : '1px solid var(--border-color)',
      borderRadius: '6px',
      outline: 'none',
      width: '200px',
      textTransform: 'uppercase'
    },
    onKeyDown: function onKeyDown(e) {
      if (e.key === 'Enter' && !isChanging) handleSave();
      if (e.key === 'Escape') handleCancel();
    },
    autoFocus: true
  }), /*#__PURE__*/React.createElement("button", {
    className: "action-btn primary",
    onClick: handleSave,
    disabled: isChanging || !newId.trim()
  }, isChanging ? 'Saving...' : 'Save'), /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    onClick: handleCancel,
    disabled: isChanging
  }, "Cancel")), error && (/*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: 'var(--error-color)'
    }
  }, error)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      color: 'var(--text-secondary)'
    }
  }, "Min ", MIN_PLAYER_ID_LENGTH, " characters. Will create if not exists. ", /*#__PURE__*/React.createElement("strong", null, "Restart required"), " after changing.")));
};
var PlayerWindow = function PlayerWindow(_ref3) {
  var _settings$playerDispl;
  var _ref3$className = _ref3.className,
    className = _ref3$className === void 0 ? '' : _ref3$className;
  // Player state (synced from Player Window via IPC)
  var _useState9 = React.useState(null),
    _useState0 = _slicedToArray(_useState9, 2),
    currentVideo = _useState0[0],
    setCurrentVideo = _useState0[1];
  var _useState1 = React.useState(false),
    _useState10 = _slicedToArray(_useState1, 2),
    isPlaying = _useState10[0],
    setIsPlaying = _useState10[1];
  var _useState11 = React.useState(70),
    _useState12 = _slicedToArray(_useState11, 2),
    volume = _useState12[0],
    setVolume = _useState12[1];
  var _useState13 = React.useState(0),
    _useState14 = _slicedToArray(_useState13, 2),
    playbackTime = _useState14[0],
    setPlaybackTime = _useState14[1]; // Current playback position in seconds
  var _useState15 = React.useState(0),
    _useState16 = _slicedToArray(_useState15, 2),
    playbackDuration = _useState16[0],
    setPlaybackDuration = _useState16[1]; // Total duration in seconds
  // Playlist/Queue state
  var _useState17 = React.useState({}),
    _useState18 = _slicedToArray(_useState17, 2),
    playlists = _useState18[0],
    setPlaylists = _useState18[1];
  var _useState19 = React.useState(''),
    _useState20 = _slicedToArray(_useState19, 2),
    activePlaylist = _useState20[0],
    setActivePlaylist = _useState20[1];
  var _useState21 = React.useState(null),
    _useState22 = _slicedToArray(_useState21, 2),
    selectedPlaylist = _useState22[0],
    setSelectedPlaylist = _useState22[1];
  var _useState23 = React.useState([]),
    _useState24 = _slicedToArray(_useState23, 2),
    queue = _useState24[0],
    setQueue = _useState24[1];
  var _useState25 = React.useState(0),
    _useState26 = _slicedToArray(_useState25, 2),
    queueIndex = _useState26[0],
    setQueueIndex = _useState26[1];
  var _useState27 = React.useState([]),
    _useState28 = _slicedToArray(_useState27, 2),
    priorityQueue = _useState28[0],
    setPriorityQueue = _useState28[1]; // KIOSK requests
  // Search state
  var _useState29 = React.useState(''),
    _useState30 = _slicedToArray(_useState29, 2),
    searchQuery = _useState30[0],
    setSearchQuery = _useState30[1];
  var _useState31 = React.useState('all'),
    _useState32 = _slicedToArray(_useState31, 2),
    searchScope = _useState32[0],
    setSearchScope = _useState32[1];
  var _useState33 = React.useState('az'),
    _useState34 = _slicedToArray(_useState33, 2),
    searchSort = _useState34[0],
    setSearchSort = _useState34[1];
  var _useState35 = React.useState(100),
    _useState36 = _slicedToArray(_useState35, 2),
    searchLimit = _useState36[0],
    setSearchLimit = _useState36[1]; // Limit displayed rows for performance
  // Supabase-powered search results (async)
  var _useState37 = React.useState([]),
    _useState38 = _slicedToArray(_useState37, 2),
    searchResults = _useState38[0],
    setSearchResults = _useState38[1];
  var _useState39 = React.useState(false),
    _useState40 = _slicedToArray(_useState39, 2),
    searchLoading = _useState40[0],
    setSearchLoading = _useState40[1];
  var _useState41 = React.useState(0),
    _useState42 = _slicedToArray(_useState41, 2),
    searchTotalCount = _useState42[0],
    setSearchTotalCount = _useState42[1];
  // UI state
  var _useState43 = React.useState('queue'),
    _useState44 = _slicedToArray(_useState43, 2),
    currentTab = _useState44[0],
    setCurrentTab = _useState44[1];
  var _useState45 = React.useState(false),
    _useState46 = _slicedToArray(_useState45, 2),
    sidebarCollapsed = _useState46[0],
    setSidebarCollapsed = _useState46[1];
  var _useState47 = React.useState(null),
    _useState48 = _slicedToArray(_useState47, 2),
    hoveredPlaylist = _useState48[0],
    setHoveredPlaylist = _useState48[1];
  // Dialog state
  var _useState49 = React.useState(false),
    _useState50 = _slicedToArray(_useState49, 2),
    showLoadDialog = _useState50[0],
    setShowLoadDialog = _useState50[1];
  var _useState51 = React.useState(null),
    _useState52 = _slicedToArray(_useState51, 2),
    playlistToLoad = _useState52[0],
    setPlaylistToLoad = _useState52[1];
  var _useState53 = React.useState(false),
    _useState54 = _slicedToArray(_useState53, 2),
    showPauseDialog = _useState54[0],
    setShowPauseDialog = _useState54[1];
  var _useState55 = React.useState(false),
    _useState56 = _slicedToArray(_useState55, 2),
    showQueuePlayDialog = _useState56[0],
    setShowQueuePlayDialog = _useState56[1];
  var _useState57 = React.useState(null),
    _useState58 = _slicedToArray(_useState57, 2),
    queueVideoToPlay = _useState58[0],
    setQueueVideoToPlay = _useState58[1];
  var _useState59 = React.useState(false),
    _useState60 = _slicedToArray(_useState59, 2),
    showSkipConfirmDialog = _useState60[0],
    setShowSkipConfirmDialog = _useState60[1];
  // Track if current video is from priority queue (for skip confirmation)
  var _useState61 = React.useState(false),
    _useState62 = _slicedToArray(_useState61, 2),
    isFromPriorityQueue = _useState62[0],
    setIsFromPriorityQueue = _useState62[1];
  // Popover state for search video click
  var _useState63 = React.useState(null),
    _useState64 = _slicedToArray(_useState63, 2),
    popoverVideo = _useState64[0],
    setPopoverVideo = _useState64[1];
  var _useState65 = React.useState({
      x: 0,
      y: 0
    }),
    _useState66 = _slicedToArray(_useState65, 2),
    popoverPosition = _useState66[0],
    setPopoverPosition = _useState66[1];
  // Settings
  var _useState67 = React.useState({
      autoShufflePlaylists: true,
      normalizeAudioLevels: false,
      enableFullscreenPlayer: true,
      fadeDuration: 2.0,
      playerDisplayId: null,
      playerFullscreen: false,
      playlistsDirectory: '/Users/mikeclarkin/Music/DJAMMS/PLAYLISTS'
    }),
    _useState68 = _slicedToArray(_useState67, 2),
    settings = _useState68[0],
    setSettings = _useState68[1];
  // Player Identity state
  var _useState69 = React.useState(DEFAULT_PLAYER_ID$1),
    _useState70 = _slicedToArray(_useState69, 2),
    playerId = _useState70[0],
    setPlayerId$1 = _useState70[1];
  var _useState71 = React.useState(false),
    _useState72 = _slicedToArray(_useState71, 2),
    playerIdInitialized = _useState72[0],
    setPlayerIdInitialized = _useState72[1];
  // Kiosk settings state
  var _useState73 = React.useState({
      mode: 'freeplay',
      uiMode: 'classic',
      // UI style: classic (SearchInterface) or jukebox (JukeboxSearchMode)
      creditBalance: 0,
      searchAllMusic: true,
      searchYoutube: false
    }),
    _useState74 = _slicedToArray(_useState73, 2),
    kioskSettings = _useState74[0],
    setKioskSettings = _useState74[1];
  var _useState75 = React.useState('disconnected'),
    _useState76 = _slicedToArray(_useState75, 2),
    kioskSerialStatus = _useState76[0];
    _useState76[1];
  var _useState77 = React.useState([]),
    _useState78 = _slicedToArray(_useState77, 2),
    kioskAvailableSerialDevices = _useState78[0],
    setKioskAvailableSerialDevices = _useState78[1];
  var _useState79 = React.useState(''),
    _useState80 = _slicedToArray(_useState79, 2),
    kioskSelectedSerialDevice = _useState80[0],
    setKioskSelectedSerialDevice = _useState80[1];
  // Player overlay settings state - default watermark is Obie_neon_no_BG.png in public folder
  var _useState81 = React.useState({
      showNowPlaying: true,
      nowPlayingSize: 100,
      nowPlayingX: 5,
      nowPlayingY: 85,
      nowPlayingOpacity: 100,
      showComingUp: true,
      comingUpSize: 100,
      comingUpX: 5,
      comingUpY: 95,
      comingUpOpacity: 100,
      showWatermark: true,
      watermarkImage: './Obie_neon_no_BG.png',
      // Default watermark from public folder (relative path for production)
      watermarkSize: 100,
      watermarkX: 90,
      watermarkY: 10,
      watermarkOpacity: 80
    }),
    _useState82 = _slicedToArray(_useState81, 2),
    overlaySettings = _useState82[0],
    setOverlaySettings = _useState82[1];
  // Display management state
  var _useState83 = React.useState([]),
    _useState84 = _slicedToArray(_useState83, 2),
    availableDisplays = _useState84[0],
    setAvailableDisplays = _useState84[1];
  var _useState85 = React.useState(false),
    _useState86 = _slicedToArray(_useState85, 2),
    playerWindowOpen = _useState86[0],
    setPlayerWindowOpen = _useState86[1];
  var _useState87 = React.useState(false),
    _useState88 = _slicedToArray(_useState87, 2),
    playerReady = _useState88[0],
    setPlayerReady = _useState88[1]; // True after queue is loaded and ready
  var playerReadyRef = React.useRef(false); // Ref to avoid stale closure in IPC callbacks
  var hasIndexedRef = React.useRef(false); // Prevent multiple indexing calls during mount
  // Debounce refs to prevent infinite loop on rapid video end events
  var lastPlayNextTimeRef = React.useRef(0);
  var lastPlayedVideoIdRef = React.useRef(null);
  var consecutiveFailuresRef = React.useRef(0);
  var MAX_CONSECUTIVE_FAILURES = 3; // Skip video after this many rapid failures
  // Playback watchdog - detects when playback stalls after video transition
  var watchdogTimerRef = React.useRef(null);
  var lastPlaybackTimeRef = React.useRef(0);
  var watchdogCheckCountRef = React.useRef(0);
  var WATCHDOG_CHECK_INTERVAL_MS = 2000; // Check every 2 seconds
  var WATCHDOG_MAX_STALL_CHECKS = 3; // Trigger recovery after 3 consecutive stall detections (6 seconds)
  // Check if we're in Electron
  var isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  // Initialize Player ID on mount
  React.useEffect(function () {
    if (!isElectron) return;
    var init = /*#__PURE__*/function () {
      var _ref4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
        var storedId, id, _t2;
        return _regenerator().w(function (_context2) {
          while (1) switch (_context2.p = _context2.n) {
            case 0:
              _context2.p = 0;
              // Check for stored ID first
              storedId = getPlayerId();
              if (!storedId) {
                _context2.n = 1;
                break;
              }
              console.log('[PlayerWindow] Using stored Player ID:', storedId);
              setPlayerId$1(storedId);
              setPlayerIdInitialized(true);
              return _context2.a(2);
            case 1:
              _context2.n = 2;
              return initializePlayerId();
            case 2:
              id = _context2.v;
              setPlayerId$1(id);
              setPlayerIdInitialized(true);
              console.log('[PlayerWindow] Initialized Player ID:', id);
              _context2.n = 4;
              break;
            case 3:
              _context2.p = 3;
              _t2 = _context2.v;
              console.error('[PlayerWindow] Failed to initialize Player ID:', _t2);
              // Fall back to default
              setPlayerId$1(DEFAULT_PLAYER_ID$1);
              setPlayerIdInitialized(true);
            case 4:
              return _context2.a(2);
          }
        }, _callee2, null, [[0, 3]]);
      }));
      return function init() {
        return _ref4.apply(this, arguments);
      };
    }();
    init();
  }, [isElectron]);
  // Supabase integration - listen for remote commands from Web Admin / Kiosk
  // This runs in the main window so commands are received even without Player Window open
  var _useSupabase = useSupabase({
      playerId: playerId,
      // Pass player ID for multi-tenancy
      autoInit: isElectron && playerIdInitialized,
      // Only initialize after playerId is ready
      onPlay: function onPlay(video, queueIndex) {
        console.log('[PlayerWindow] Supabase play command received:', video === null || video === void 0 ? void 0 : video.title, 'queueIndex:', queueIndex);
        // If queueIndex is provided, play from that position in the queue (click-to-play from Web Admin)
        if (typeof queueIndex === 'number' && queueIndex >= 0) {
          var currentQueue = queueRef.current;
          if (currentQueue && queueIndex < currentQueue.length) {
            var videoToPlay = currentQueue[queueIndex];
            console.log('[PlayerWindow] Playing from queue index:', queueIndex, videoToPlay.title);
            setQueueIndex(queueIndex);
            setCurrentVideo(videoToPlay);
            setIsPlaying(true);
            if (isElectron) {
              window.electronAPI.controlPlayerWindow('play', videoToPlay);
            }
            return;
          }
        }
        // If video object is provided, play that specific video
        if (video && video.id) {
          // Convert QueueVideoItem to Video format and play
          var _videoToPlay = {
            id: video.id,
            src: video.src,
            title: video.title,
            artist: video.artist,
            path: video.path,
            playlist: video.playlist,
            playlistDisplayName: video.playlistDisplayName,
            duration: video.duration
          };
          setCurrentVideo(_videoToPlay);
          setIsPlaying(true);
          if (isElectron) {
            window.electronAPI.controlPlayerWindow('play', _videoToPlay);
          }
        } else if (currentVideo) {
          // Resume current video
          setIsPlaying(true);
          if (isElectron) {
            window.electronAPI.controlPlayerWindow('resume');
          }
        }
      },
      onPause: function onPause() {
        console.log('[PlayerWindow] Supabase pause command received');
        setIsPlaying(false);
        if (isElectron) {
          window.electronAPI.controlPlayerWindow('pause');
        }
      },
      onResume: function onResume() {
        console.log('[PlayerWindow] Supabase resume command received');
        setIsPlaying(true);
        if (isElectron) {
          window.electronAPI.controlPlayerWindow('resume');
        }
      },
      onSkip: function onSkip() {
        console.log('[PlayerWindow] Supabase skip command received');
        // Send skip command to Player Window - triggers fade-out, then video end
        if (isElectron) {
          window.electronAPI.controlPlayerWindow('skip');
        }
      },
      onSetVolume: function onSetVolume(newVolume) {
        console.log('[PlayerWindow] Supabase volume command received:', newVolume);
        setVolume(Math.round(newVolume * 100));
        if (isElectron) {
          window.electronAPI.controlPlayerWindow('setVolume', newVolume);
          window.electronAPI.saveSetting('volume', newVolume);
        }
      },
      onSeekTo: function onSeekTo(position) {
        console.log('[PlayerWindow] Supabase seek command received:', position);
        if (isElectron) {
          window.electronAPI.controlPlayerWindow('seekTo', position);
        }
      },
      onQueueAdd: function onQueueAdd(video, queueType) {
        console.log('[PlayerWindow] Supabase queue_add command received:', video.title, queueType);
        var videoToAdd = {
          id: video.id,
          src: video.src,
          title: video.title,
          artist: video.artist,
          path: video.path,
          playlist: video.playlist,
          playlistDisplayName: video.playlistDisplayName,
          duration: video.duration
        };
        if (queueType === 'priority') {
          // Add to separate priority queue (consumed first on skip)
          setPriorityQueue(function (prev) {
            return [].concat(_toConsumableArray(prev), [videoToAdd]);
          });
        } else {
          // Add to end of active queue
          setQueue(function (prev) {
            return [].concat(_toConsumableArray(prev), [videoToAdd]);
          });
        }
      },
      onQueueShuffle: function onQueueShuffle() {
        console.log('[PlayerWindow] Supabase queue_shuffle command received');
        setQueue(function (prev) {
          // Keep the current video at index 0, shuffle the rest
          var currentIdx = queueIndexRef.current;
          var currentVideo = prev[currentIdx];
          var otherVideos = prev.filter(function (_, idx) {
            return idx !== currentIdx;
          });
          var shuffledOthers = shuffleArray(otherVideos);
          // Put current video at index 0, shuffled rest after
          var newQueue = [currentVideo].concat(_toConsumableArray(shuffledOthers));
          setQueueIndex(0); // Current video is now at index 0
          // Trigger immediate sync so Web Admin sees the shuffled queue right away
          // We call syncState inside the setter to access the new queue value
          setTimeout(function () {
            syncState({
              activeQueue: newQueue,
              queueIndex: 0
            }, true); // immediate = true to bypass debounce
          }, 0);
          return newQueue;
        });
      },
      onLoadPlaylist: function onLoadPlaylist(playlistName, shuffle) {
        console.log('[PlayerWindow] Supabase load_playlist command received:', playlistName, shuffle);
        // Find the playlist (may have YouTube ID prefix)
        var playlistKey = Object.keys(playlists).find(function (key) {
          return key === playlistName || key.includes(playlistName);
        });
        if (playlistKey && playlists[playlistKey]) {
          var playlistTracks = playlists[playlistKey];
          var shouldShuffle = shuffle !== null && shuffle !== void 0 ? shuffle : settings.autoShufflePlaylists;
          var finalTracks = shouldShuffle ? shuffleArray(playlistTracks) : _toConsumableArray(playlistTracks);
          setActivePlaylist(playlistKey);
          setQueue(finalTracks);
          setQueueIndex(0);
          if (finalTracks.length > 0) {
            setCurrentVideo(finalTracks[0]);
            setIsPlaying(true);
            if (isElectron) {
              window.electronAPI.controlPlayerWindow('play', finalTracks[0]);
            }
          }
        }
      },
      onQueueMove: function onQueueMove(fromIndex, toIndex) {
        console.log('[PlayerWindow] Supabase queue_move command received:', fromIndex, '->', toIndex);
        setQueue(function (prev) {
          var newQueue = _toConsumableArray(prev);
          var currentIdx = queueIndexRef.current;
          // Validate indices
          if (fromIndex < 0 || fromIndex >= newQueue.length || toIndex < 0 || toIndex >= newQueue.length) {
            console.warn('[PlayerWindow] Invalid queue move indices');
            return prev;
          }
          // Remove item from old position and insert at new position
          var _newQueue$splice = newQueue.splice(fromIndex, 1),
            _newQueue$splice2 = _slicedToArray(_newQueue$splice, 1),
            movedItem = _newQueue$splice2[0];
          newQueue.splice(toIndex, 0, movedItem);
          // Adjust queueIndex if needed to keep current video playing
          var newQueueIdx = currentIdx;
          if (fromIndex === currentIdx) {
            // Moving the current video
            newQueueIdx = toIndex;
          } else if (fromIndex < currentIdx && toIndex >= currentIdx) {
            // Moving item from before current to after current
            newQueueIdx = currentIdx - 1;
          } else if (fromIndex > currentIdx && toIndex <= currentIdx) {
            // Moving item from after current to before current
            newQueueIdx = currentIdx + 1;
          }
          setQueueIndex(newQueueIdx);
          // Sync immediately
          setTimeout(function () {
            syncState({
              activeQueue: newQueue,
              queueIndex: newQueueIdx
            }, true);
          }, 0);
          return newQueue;
        });
      },
      onQueueRemove: function onQueueRemove(videoId, queueType) {
        console.log('[PlayerWindow] Supabase queue_remove command received:', videoId, queueType);
        if (queueType === 'priority') {
          setPriorityQueue(function (prev) {
            var newQueue = prev.filter(function (v) {
              return v.id !== videoId;
            });
            setTimeout(function () {
              return syncState({
                priorityQueue: newQueue
              }, true);
            }, 0);
            return newQueue;
          });
        } else {
          setQueue(function (prev) {
            var currentIdx = queueIndexRef.current;
            var removeIdx = prev.findIndex(function (v) {
              return v.id === videoId;
            });
            // Don't remove if it's the currently playing video or not found
            if (removeIdx === -1 || removeIdx === currentIdx) {
              console.warn('[PlayerWindow] Cannot remove: video not found or currently playing');
              return prev;
            }
            var newQueue = prev.filter(function (v) {
              return v.id !== videoId;
            });
            // Adjust queueIndex if removing item before current
            var newQueueIdx = currentIdx;
            if (removeIdx < currentIdx) {
              newQueueIdx = currentIdx - 1;
              setQueueIndex(newQueueIdx);
            }
            setTimeout(function () {
              return syncState({
                activeQueue: newQueue,
                queueIndex: newQueueIdx
              }, true);
            }, 0);
            return newQueue;
          });
        }
      }
    }),
    supabaseInitialized = _useSupabase.isInitialized,
    syncState = _useSupabase.syncState;
  // Shuffle helper
  var shuffleArray = function shuffleArray(array) {
    var shuffled = _toConsumableArray(array);
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var _ref5 = [shuffled[j], shuffled[i]];
      shuffled[i] = _ref5[0];
      shuffled[j] = _ref5[1];
    }
    return shuffled;
  };
  // Auto-collapse sidebar on small screens
  React.useEffect(function () {
    var handleResize = function handleResize() {
      if (window.innerWidth < 1000) {
        setSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return function () {
      return window.removeEventListener('resize', handleResize);
    };
  }, []);
  // Load playlists and settings on mount
  React.useEffect(function () {
    // Guard against multiple executions (React Strict Mode or HMR)
    if (hasIndexedRef.current) return;
    var loadData = /*#__PURE__*/function () {
      var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3() {
        var _yield$window$electro, loadedPlaylists, savedVolume, savedDisplayId, savedFullscreen, savedAutoShuffle, savedNormalize, savedEnablePlayer, savedFadeDuration, savedPlaylistsDir, savedOverlaySettings, savedKioskSettings, savedActivePlaylist, _playlistToLoad, playlistTracks, shouldShuffle, finalTracks, webPlaylists, _t3;
        return _regenerator().w(function (_context3) {
          while (1) switch (_context3.p = _context3.n) {
            case 0:
              if (!isElectron) {
                _context3.n = 16;
                break;
              }
              _context3.p = 1;
              hasIndexedRef.current = true; // Mark as indexed BEFORE async operations
              _context3.n = 2;
              return window.electronAPI.getPlaylists();
            case 2:
              _yield$window$electro = _context3.v;
              loadedPlaylists = _yield$window$electro.playlists;
              setPlaylists(loadedPlaylists || {});
              localSearchService.indexVideos(loadedPlaylists || {});
              // Index playlists to Supabase via Player Window (for Admin Console / Kiosk search)
              window.electronAPI.controlPlayerWindow('indexPlaylists', loadedPlaylists || {});
              // Load all saved settings
              _context3.n = 3;
              return window.electronAPI.getSetting('volume');
            case 3:
              savedVolume = _context3.v;
              if (savedVolume !== undefined) setVolume(Math.round(savedVolume * 100));
              _context3.n = 4;
              return window.electronAPI.getSetting('playerDisplayId');
            case 4:
              savedDisplayId = _context3.v;
              _context3.n = 5;
              return window.electronAPI.getSetting('playerWindowFullscreen');
            case 5:
              savedFullscreen = _context3.v;
              _context3.n = 6;
              return window.electronAPI.getSetting('autoShufflePlaylists');
            case 6:
              savedAutoShuffle = _context3.v;
              _context3.n = 7;
              return window.electronAPI.getSetting('normalizeAudioLevels');
            case 7:
              savedNormalize = _context3.v;
              _context3.n = 8;
              return window.electronAPI.getSetting('enableFullscreenPlayer');
            case 8:
              savedEnablePlayer = _context3.v;
              _context3.n = 9;
              return window.electronAPI.getSetting('fadeDuration');
            case 9:
              savedFadeDuration = _context3.v;
              _context3.n = 10;
              return window.electronAPI.getPlaylistsDirectory();
            case 10:
              savedPlaylistsDir = _context3.v;
              setSettings(function (s) {
                return _objectSpread2(_objectSpread2({}, s), {}, {
                  playerDisplayId: savedDisplayId !== null && savedDisplayId !== void 0 ? savedDisplayId : s.playerDisplayId,
                  playerFullscreen: savedFullscreen !== null && savedFullscreen !== void 0 ? savedFullscreen : s.playerFullscreen,
                  autoShufflePlaylists: savedAutoShuffle !== null && savedAutoShuffle !== void 0 ? savedAutoShuffle : s.autoShufflePlaylists,
                  normalizeAudioLevels: savedNormalize !== null && savedNormalize !== void 0 ? savedNormalize : s.normalizeAudioLevels,
                  enableFullscreenPlayer: savedEnablePlayer !== null && savedEnablePlayer !== void 0 ? savedEnablePlayer : s.enableFullscreenPlayer,
                  fadeDuration: savedFadeDuration !== null && savedFadeDuration !== void 0 ? savedFadeDuration : s.fadeDuration,
                  playlistsDirectory: savedPlaylistsDir !== null && savedPlaylistsDir !== void 0 ? savedPlaylistsDir : s.playlistsDirectory
                });
              });
              // Load saved overlay settings
              _context3.n = 11;
              return window.electronAPI.getSetting('overlaySettings');
            case 11:
              savedOverlaySettings = _context3.v;
              if (savedOverlaySettings) {
                console.log('[PlayerWindow] Loaded saved overlay settings:', savedOverlaySettings);
                setOverlaySettings(function (prev) {
                  return _objectSpread2(_objectSpread2({}, prev), savedOverlaySettings);
                });
              }
              // Load saved kiosk settings
              _context3.n = 12;
              return window.electronAPI.getSetting('kioskSettings');
            case 12:
              savedKioskSettings = _context3.v;
              if (savedKioskSettings) {
                console.log('[PlayerWindow] Loaded saved kiosk settings:', savedKioskSettings);
                setKioskSettings(function (prev) {
                  return _objectSpread2(_objectSpread2({}, prev), savedKioskSettings);
                });
              }
              // Load last active playlist and auto-play
              _context3.n = 13;
              return window.electronAPI.getSetting('activePlaylist');
            case 13:
              savedActivePlaylist = _context3.v;
              _playlistToLoad = savedActivePlaylist || findDefaultPlaylist(loadedPlaylists);
              if (_playlistToLoad && loadedPlaylists[_playlistToLoad]) {
                console.log('[PlayerWindow] Auto-loading playlist:', _playlistToLoad);
                setActivePlaylist(_playlistToLoad);
                playlistTracks = loadedPlaylists[_playlistToLoad] || [];
                shouldShuffle = savedAutoShuffle !== null && savedAutoShuffle !== void 0 ? savedAutoShuffle : true;
                finalTracks = shouldShuffle ? shuffleArray(playlistTracks) : _toConsumableArray(playlistTracks);
                setQueue(finalTracks);
                setQueueIndex(0);
                if (finalTracks.length > 0) {
                  // Delay to ensure Player Window is fully loaded and ready to receive IPC
                  // Player Window is created at 500ms, needs time to load and register handlers
                  setTimeout(function () {
                    console.log('[PlayerWindow] Sending initial play command to Player Window');
                    setCurrentVideo(finalTracks[0]);
                    setIsPlaying(true);
                    // Mark player as ready since we have a queue loaded
                    if (!playerReadyRef.current) {
                      playerReadyRef.current = true;
                      setPlayerReady(true);
                    }
                    // Send play command to Player Window (the ONLY player)
                    window.electronAPI.controlPlayerWindow('play', finalTracks[0]);
                  }, 1500);
                }
              }
              _context3.n = 15;
              break;
            case 14:
              _context3.p = 14;
              _t3 = _context3.v;
              console.error('Failed to load data:', _t3);
              hasIndexedRef.current = false; // Reset on error to allow retry
            case 15:
              _context3.n = 17;
              break;
            case 16:
              hasIndexedRef.current = true;
              webPlaylists = window.__PLAYLISTS__ || {};
              setPlaylists(webPlaylists);
              localSearchService.indexVideos(webPlaylists);
            case 17:
              return _context3.a(2);
          }
        }, _callee3, null, [[1, 14]]);
      }));
      return function loadData() {
        return _ref6.apply(this, arguments);
      };
    }();
    loadData();
  }, [isElectron]);
  // Helper function to find DJAMMS Default playlist
  var findDefaultPlaylist = function findDefaultPlaylist(playlists) {
    var playlistNames = Object.keys(playlists);
    // Look for playlist containing "DJAMMS_Default" (with or without YouTube ID prefix)
    var defaultPlaylist = playlistNames.find(function (name) {
      return name.includes('DJAMMS_Default') || name.toLowerCase().includes('djamms default');
    });
    // Fallback to first playlist if no default found
    return defaultPlaylist || playlistNames[0] || null;
  };
  // Load available displays
  React.useEffect(function () {
    var loadDisplays = /*#__PURE__*/function () {
      var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4() {
        var displays, status, _t4;
        return _regenerator().w(function (_context4) {
          while (1) switch (_context4.p = _context4.n) {
            case 0:
              if (!isElectron) {
                _context4.n = 5;
                break;
              }
              _context4.p = 1;
              _context4.n = 2;
              return window.electronAPI.getDisplays();
            case 2:
              displays = _context4.v;
              setAvailableDisplays(displays || []);
              // Check player window status
              _context4.n = 3;
              return window.electronAPI.getPlayerWindowStatus();
            case 3:
              status = _context4.v;
              setPlayerWindowOpen((status === null || status === void 0 ? void 0 : status.isOpen) || false);
              _context4.n = 5;
              break;
            case 4:
              _context4.p = 4;
              _t4 = _context4.v;
              console.error('Failed to load displays:', _t4);
            case 5:
              return _context4.a(2);
          }
        }, _callee4, null, [[1, 4]]);
      }));
      return function loadDisplays() {
        return _ref7.apply(this, arguments);
      };
    }();
    loadDisplays();
  }, [isElectron]);
  // Listen for player window closed event
  React.useEffect(function () {
    var _api$onPlayerWindowCl;
    if (!isElectron) return;
    var api = window.electronAPI;
    var unsubPlayerClosed = (_api$onPlayerWindowCl = api.onPlayerWindowClosed) === null || _api$onPlayerWindowCl === void 0 ? void 0 : _api$onPlayerWindowCl.call(api, function () {
      setPlayerWindowOpen(false);
    });
    return function () {
      unsubPlayerClosed === null || unsubPlayerClosed === void 0 || unsubPlayerClosed();
    };
  }, [isElectron]);
  // Set up Electron IPC listeners
  React.useEffect(function () {
    var _api$onDebugSkipToEnd;
    if (!isElectron) return;
    var api = window.electronAPI;
    var unsubToggle = api.onTogglePlayback(function () {
      if (isPlaying) handlePauseClick();else handleResumePlayback();
    });
    var unsubSkip = api.onSkipVideo(function () {
      return skipTrack();
    });
    var unsubDebugSkip = (_api$onDebugSkipToEnd = api.onDebugSkipToEnd) === null || _api$onDebugSkipToEnd === void 0 ? void 0 : _api$onDebugSkipToEnd.call(api, function () {
      // Debug feature: seek to 15 seconds before end of video to test crossfade
      console.log('[PlayerWindow] Debug skip to end triggered (Shift+>)');
      if (isElectron && playerReady) {
        window.electronAPI.controlPlayerWindow('debugSkipToEnd');
      }
    });
    var unsubVolumeUp = api.onVolumeUp(function () {
      return setVolume(function (v) {
        return Math.min(100, v + 10);
      });
    });
    var unsubVolumeDown = api.onVolumeDown(function () {
      return setVolume(function (v) {
        return Math.max(0, v - 10);
      });
    });
    var unsubPlaylistDir = api.onPlaylistsDirectoryChanged(/*#__PURE__*/function () {
      var _ref8 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(newPath) {
        var _yield$api$getPlaylis, newPlaylists;
        return _regenerator().w(function (_context5) {
          while (1) switch (_context5.n) {
            case 0:
              console.log('[PlayerWindow] Playlists directory changed to:', newPath);
              _context5.n = 1;
              return api.getPlaylists();
            case 1:
              _yield$api$getPlaylis = _context5.v;
              newPlaylists = _yield$api$getPlaylis.playlists;
              setPlaylists(newPlaylists || {});
              localSearchService.indexVideos(newPlaylists || {});
              // Re-index to Supabase so Web Admin gets the updated playlists
              window.electronAPI.controlPlayerWindow('indexPlaylists', newPlaylists || {});
              // Update settings state
              setSettings(function (s) {
                return _objectSpread2(_objectSpread2({}, s), {}, {
                  playlistsDirectory: newPath
                });
              });
            case 2:
              return _context5.a(2);
          }
        }, _callee5);
      }));
      return function (_x) {
        return _ref8.apply(this, arguments);
      };
    }());
    return function () {
      unsubToggle === null || unsubToggle === void 0 || unsubToggle();
      unsubSkip === null || unsubSkip === void 0 || unsubSkip();
      unsubDebugSkip === null || unsubDebugSkip === void 0 || unsubDebugSkip();
      unsubVolumeUp === null || unsubVolumeUp === void 0 || unsubVolumeUp();
      unsubVolumeDown === null || unsubVolumeDown === void 0 || unsubVolumeDown();
      unsubPlaylistDir === null || unsubPlaylistDir === void 0 || unsubPlaylistDir();
    };
  }, [isElectron, isPlaying, playerReady]);
  // Player control functions
  var handlePauseClick = function handlePauseClick() {
    if (!playerReady) return; // Ignore until player is ready
    if (isPlaying) {
      setShowPauseDialog(true);
    } else {
      handleResumePlayback();
    }
  };
  var confirmPause = function confirmPause() {
    setIsPlaying(false);
    if (isElectron) {
      window.electronAPI.controlPlayerWindow('pause');
    }
    setShowPauseDialog(false);
    setCurrentTab('queue'); // Auto-switch to Queue tab
  };
  var handleResumePlayback = function handleResumePlayback() {
    if (currentVideo) {
      if (isElectron) {
        window.electronAPI.controlPlayerWindow('resume');
      }
      setIsPlaying(true);
      setCurrentTab('queue'); // Auto-switch to Queue tab
    } else if (queue.length > 0) {
      playVideoAtIndex(0);
      setCurrentTab('queue'); // Auto-switch to Queue tab
    }
  };
  // Send skip command to Player Window - triggers fade-out, then video end
  var sendSkipCommand = React.useCallback(function () {
    console.log('[PlayerWindow] Sending skip command to Player Window');
    if (isElectron) {
      window.electronAPI.controlPlayerWindow('skip');
    }
    setCurrentTab('queue'); // Auto-switch to Queue tab
  }, [isElectron]);
  var skipTrack = function skipTrack() {
    if (!playerReady) return; // Ignore until player is ready
    // If current video is from priority queue, show confirmation dialog
    if (isFromPriorityQueue) {
      setShowSkipConfirmDialog(true);
      return;
    }
    // Send skip command - Player Window will fade out, then trigger onVideoEnd
    sendSkipCommand();
  };
  // Actually perform the skip (called after confirmation or directly if not priority)
  var confirmSkip = function confirmSkip() {
    setShowSkipConfirmDialog(false);
    // Send skip command - Player Window will fade out, then trigger onVideoEnd
    sendSkipCommand();
  };
  // Send play command to Player Window (the ONLY player - handles all audio/video)
  var sendPlayCommand = React.useCallback(function (video) {
    if (isElectron) {
      window.electronAPI.controlPlayerWindow('play', video);
    }
  }, [isElectron]);
  // Unified function to play the next video - ALWAYS checks priority queue first
  var playNextVideo = React.useCallback(function () {
    // DEBOUNCE: Prevent rapid-fire calls that cause infinite loop on video load failure
    var now = Date.now();
    var timeSinceLastCall = now - lastPlayNextTimeRef.current;
    if (timeSinceLastCall < 500) {
      console.warn('[PlayerWindow] playNextVideo debounced - too rapid (' + timeSinceLastCall + 'ms since last call)');
      return;
    }
    lastPlayNextTimeRef.current = now;
    console.log('[PlayerWindow] 🎬 playNextVideo called at', new Date().toISOString());
    console.log('[PlayerWindow] └─ priorityQueue:', priorityQueueRef.current.length, 'activeQueue:', queueRef.current.length, 'currentIndex:', queueIndexRef.current);
    // Reset watchdog state since we're initiating a new video
    watchdogCheckCountRef.current = 0;
    lastPlaybackTimeRef.current = 0;
    // ALWAYS check priority queue first (KIOSK requests take precedence)
    if (priorityQueueRef.current.length > 0) {
      var _nextVideo = priorityQueueRef.current[0];
      var newPriorityQueue = priorityQueueRef.current.slice(1);
      console.log('[PlayerWindow] Playing from priority queue:', _nextVideo.title);
      // Update ref SYNCHRONOUSLY before state update to prevent race conditions
      priorityQueueRef.current = newPriorityQueue;
      // Track video for failure detection
      var videoId = _nextVideo.id || _nextVideo.src;
      if (lastPlayedVideoIdRef.current === videoId) {
        consecutiveFailuresRef.current++;
        console.warn('[PlayerWindow] Same video played again, consecutive failures:', consecutiveFailuresRef.current);
      } else {
        consecutiveFailuresRef.current = 0;
        lastPlayedVideoIdRef.current = videoId;
      }
      setPriorityQueue(newPriorityQueue);
      setCurrentVideo(_nextVideo);
      setIsPlaying(true);
      setIsFromPriorityQueue(true); // Mark as priority queue video
      sendPlayCommand(_nextVideo);
      // Immediate sync so Web Admin sees the update right away
      setTimeout(function () {
        syncState({
          status: 'playing',
          isPlaying: true,
          currentVideo: _nextVideo,
          priorityQueue: newPriorityQueue
        }, true);
      }, 0);
      return;
    }
    // Fall back to active queue - advance to next track or loop
    var currentQueue = queueRef.current;
    var currentIndex = queueIndexRef.current;
    if (currentQueue.length === 0) {
      console.log('[PlayerWindow] Both queues empty, nothing to play');
      return;
    }
    var nextIndex = currentIndex < currentQueue.length - 1 ? currentIndex + 1 : 0;
    var nextVideo = currentQueue[nextIndex];
    // Track video for failure detection - if same video fails multiple times, skip it
    if (nextVideo) {
      var _videoId = nextVideo.id || nextVideo.src;
      if (lastPlayedVideoIdRef.current === _videoId) {
        consecutiveFailuresRef.current++;
        console.warn('[PlayerWindow] Same video attempted again, consecutive failures:', consecutiveFailuresRef.current);
        // If we've failed too many times on this video, skip to the next one
        if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          console.error('[PlayerWindow] Too many consecutive failures for video:', nextVideo.title, '- skipping');
          nextIndex = nextIndex < currentQueue.length - 1 ? nextIndex + 1 : 0;
          nextVideo = currentQueue[nextIndex];
          consecutiveFailuresRef.current = 0;
          lastPlayedVideoIdRef.current = nextVideo ? nextVideo.id || nextVideo.src : null;
        }
      } else {
        consecutiveFailuresRef.current = 0;
        lastPlayedVideoIdRef.current = _videoId;
      }
    }
    if (nextVideo) {
      console.log('[PlayerWindow] Playing from active queue index:', nextIndex, nextVideo.title);
      // Update ref SYNCHRONOUSLY before state update to prevent race conditions
      queueIndexRef.current = nextIndex;
      setQueueIndex(nextIndex);
      setCurrentVideo(nextVideo);
      setIsPlaying(true);
      setIsFromPriorityQueue(false); // Not from priority queue
      sendPlayCommand(nextVideo);
      // Immediate sync so Web Admin sees the update right away
      setTimeout(function () {
        syncState({
          status: 'playing',
          isPlaying: true,
          currentVideo: nextVideo,
          queueIndex: nextIndex
        }, true);
      }, 0);
    }
  }, [sendPlayCommand, syncState]);
  var toggleShuffle = function toggleShuffle() {
    if (!playerReady) return; // Ignore until player is ready
    // Shuffle the current queue (keeping current video at position 0)
    if (queue.length > 1) {
      var _currentTrack = queue[queueIndex];
      var otherTracks = queue.filter(function (_, i) {
        return i !== queueIndex;
      });
      var shuffledOthers = shuffleArray(otherTracks);
      var newQueue = [_currentTrack].concat(_toConsumableArray(shuffledOthers));
      setQueue(newQueue);
      setQueueIndex(0); // Current track is now at index 0
      setCurrentTab('queue'); // Auto-switch to Queue tab
    }
  };
  var playVideoAtIndex = React.useCallback(function (index) {
    var video = queue[index];
    if (video) {
      setQueueIndex(index);
      setCurrentVideo(video);
      setIsPlaying(true);
      // Send to Player Window (the ONLY player)
      sendPlayCommand(video);
    }
  }, [queue, sendPlayCommand]);
  // Show confirmation dialog before playing from queue
  var handleQueueItemClick = React.useCallback(function (index) {
    if (!playerReady) return; // Ignore until player is ready
    var video = queue[index];
    if (video) {
      setQueueVideoToPlay({
        video: video,
        index: index
      });
      setShowQueuePlayDialog(true);
    }
  }, [queue, playerReady]);
  // Confirm and play the selected queue video
  var confirmQueuePlay = React.useCallback(function () {
    if (queueVideoToPlay) {
      playVideoAtIndex(queueVideoToPlay.index);
    }
    setShowQueuePlayDialog(false);
    setQueueVideoToPlay(null);
  }, [queueVideoToPlay, playVideoAtIndex]);
  // Move selected queue video to play next (position after current)
  var moveQueueVideoToNext = React.useCallback(function () {
    if (queueVideoToPlay && queue.length > 1) {
      var index = queueVideoToPlay.index;
      var targetIndex = queueIndex + 1; // Position right after current
      // Don't move if already in the next position or is the current video
      if (index === targetIndex || index === queueIndex) {
        setShowQueuePlayDialog(false);
        setQueueVideoToPlay(null);
        return;
      }
      var newQueue = _toConsumableArray(queue);
      var _newQueue$splice3 = newQueue.splice(index, 1),
        _newQueue$splice4 = _slicedToArray(_newQueue$splice3, 1),
        movedVideo = _newQueue$splice4[0];
      // If we removed from before the target, adjust target index
      var adjustedTarget = index < targetIndex ? targetIndex - 1 : targetIndex;
      newQueue.splice(adjustedTarget, 0, movedVideo);
      setQueue(newQueue);
    }
    setShowQueuePlayDialog(false);
    setQueueVideoToPlay(null);
  }, [queueVideoToPlay, queue, queueIndex]);
  // Remove selected video from queue
  var removeQueueVideo = React.useCallback(function () {
    if (queueVideoToPlay) {
      var index = queueVideoToPlay.index;
      // Don't remove the currently playing video
      if (index === queueIndex) {
        setShowQueuePlayDialog(false);
        setQueueVideoToPlay(null);
        return;
      }
      var newQueue = queue.filter(function (_, i) {
        return i !== index;
      });
      setQueue(newQueue);
      // Adjust queueIndex if we removed a video before the current one
      if (index < queueIndex) {
        setQueueIndex(function (prev) {
          return prev - 1;
        });
      }
    }
    setShowQueuePlayDialog(false);
    setQueueVideoToPlay(null);
  }, [queueVideoToPlay, queue, queueIndex]);
  // Playlist functions
  var handlePlaylistClick = function handlePlaylistClick(playlistName) {
    setSelectedPlaylist(playlistName);
    setCurrentTab('search');
    setSearchScope('playlist'); // Filter by selected playlist
    setSearchLimit(100); // Reset pagination
  };
  var handlePlayButtonClick = function handlePlayButtonClick(e, playlistName) {
    e.stopPropagation();
    setPlaylistToLoad(playlistName);
    setShowLoadDialog(true);
  };
  var confirmLoadPlaylist = function confirmLoadPlaylist() {
    if (playlistToLoad) {
      setActivePlaylist(playlistToLoad);
      setSelectedPlaylist(null);
      var playlistTracks = playlists[playlistToLoad] || [];
      var finalTracks = settings.autoShufflePlaylists ? shuffleArray(playlistTracks) : _toConsumableArray(playlistTracks);
      setQueue(finalTracks);
      setQueueIndex(0);
      if (finalTracks.length > 0) {
        setCurrentVideo(finalTracks[0]);
        setIsPlaying(true);
        // Send to Player Window (the ONLY player)
        sendPlayCommand(finalTracks[0]);
      }
      // Save active playlist to persist between sessions
      if (isElectron) {
        window.electronAPI.setSetting('activePlaylist', playlistToLoad);
      }
    }
    setShowLoadDialog(false);
    setPlaylistToLoad(null);
  };
  var handleTabChange = function handleTabChange(tab) {
    // If leaving Search tab while a playlist is selected, clear the selection
    if (currentTab === 'search' && tab !== 'search' && selectedPlaylist) {
      setSelectedPlaylist(null);
      setSearchScope('all'); // Reset to default filter
    }
    // If clicking Search tab directly (not from playlist click), reset to defaults
    if (tab === 'search' && currentTab !== 'search') {
      setSearchQuery(''); // Clear search text
      setSearchScope('all'); // Default filter
      setSearchSort('artist'); // Default sort
      setSelectedPlaylist(null); // Clear any selected playlist
      setSearchLimit(100); // Reset pagination
    }
    setCurrentTab(tab);
  };
  var handleScopeChange = function handleScopeChange(scope) {
    setSearchScope(scope);
    setSearchLimit(100); // Reset pagination when filter changes
    if (scope !== 'playlist') setSelectedPlaylist(null);
  };
  // Filtering and sorting (memoized callbacks for use in useMemo)
  var filterByScope = React.useCallback(function (videos, scope) {
    // Helper to check if a video contains 'karaoke' in title, filename, or playlist
    var isKaraoke = function isKaraoke(v) {
      var _v$title, _v$playlist;
      var title = ((_v$title = v.title) === null || _v$title === void 0 ? void 0 : _v$title.toLowerCase()) || '';
      var path = (v.path || v.src || '').toLowerCase();
      var playlist = ((_v$playlist = v.playlist) === null || _v$playlist === void 0 ? void 0 : _v$playlist.toLowerCase()) || '';
      return title.includes('karaoke') || path.includes('karaoke') || playlist.includes('karaoke');
    };
    switch (scope) {
      case 'all':
        return videos;
      case 'no-karaoke':
        return videos.filter(function (v) {
          return !isKaraoke(v);
        });
      case 'karaoke':
        return videos.filter(function (v) {
          return isKaraoke(v);
        });
      case 'queue':
        return queue;
      case 'playlist':
        if (!selectedPlaylist) return [];
        return playlists[selectedPlaylist] || [];
      default:
        return videos;
    }
  }, [queue, selectedPlaylist, playlists]);
  var sortResults = React.useCallback(function (results, sortBy) {
    var sorted = _toConsumableArray(results);
    switch (sortBy) {
      case 'artist':
        return sorted.sort(function (a, b) {
          return (a.artist || '').localeCompare(b.artist || '');
        });
      case 'title':
      case 'az':
        return sorted.sort(function (a, b) {
          return (a.title || '').localeCompare(b.title || '');
        });
      case 'playlist':
        return sorted.sort(function (a, b) {
          return (a.playlist || '').localeCompare(b.playlist || '');
        });
      default:
        return sorted;
    }
  }, []);
  // Memoize getAllVideos to avoid recomputing on every render (for local fallback)
  var allVideos = React.useMemo(function () {
    var videos = Object.values(playlists).flat();
    // Deduplicate by path (or title+artist if path is not available)
    var seen = new Set();
    return videos.filter(function (video) {
      var key = video.path || video.src || "".concat(video.title, "|").concat(video.artist);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playlists]);
  // Search effect - calls Supabase PostgreSQL full-text search (or browse when query empty)
  React.useEffect(function () {
    var supabase = getSupabaseService();
    // For playlist scope, always use local data since we have it in memory
    if (searchScope === 'playlist') {
      if (!selectedPlaylist) {
        setSearchResults([]);
        setSearchTotalCount(0);
        return;
      }
      var results = playlists[selectedPlaylist] || [];
      if (searchQuery.trim()) {
        results = results.filter(function (video) {
          var _video$title, _video$artist;
          return ((_video$title = video.title) === null || _video$title === void 0 ? void 0 : _video$title.toLowerCase().includes(searchQuery.toLowerCase())) || ((_video$artist = video.artist) === null || _video$artist === void 0 ? void 0 : _video$artist.toLowerCase().includes(searchQuery.toLowerCase()));
        });
      }
      setSearchResults(sortResults(results, searchSort));
      setSearchTotalCount(results.length);
      return;
    }
    if (!supabase.initialized) {
      // Fallback to local search/browse if Supabase not ready
      var _results = filterByScope(allVideos, searchScope);
      if (searchQuery.trim()) {
        _results = _results.filter(function (video) {
          var _video$title2, _video$artist2;
          return ((_video$title2 = video.title) === null || _video$title2 === void 0 ? void 0 : _video$title2.toLowerCase().includes(searchQuery.toLowerCase())) || ((_video$artist2 = video.artist) === null || _video$artist2 === void 0 ? void 0 : _video$artist2.toLowerCase().includes(searchQuery.toLowerCase()));
        });
      }
      setSearchResults(sortResults(_results, searchSort));
      setSearchTotalCount(_results.length);
      return;
    }
    // Debounce search/browse requests
    var timeoutId = setTimeout(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6() {
      var dbSortBy, _results2, total, _t5;
      return _regenerator().w(function (_context6) {
        while (1) switch (_context6.p = _context6.n) {
          case 0:
            setSearchLoading(true);
            _context6.p = 1;
            // Map UI sort values to database sort values
            dbSortBy = searchSort === 'az' ? 'title' : searchSort;
            if (!searchQuery.trim()) {
              _context6.n = 3;
              break;
            }
            _context6.n = 2;
            return supabase.searchVideos(searchQuery, searchScope, searchLimit, 0);
          case 2:
            _results2 = _context6.v;
            // Apply local sorting to search results
            _results2 = sortResults(_results2, searchSort);
            _context6.n = 5;
            break;
          case 3:
            _context6.n = 4;
            return supabase.browseVideos(searchScope, dbSortBy, 'asc', searchLimit, 0);
          case 4:
            _results2 = _context6.v;
          case 5:
            setSearchResults(_results2);
            // Get total count for pagination
            _context6.n = 6;
            return supabase.countVideos(searchScope);
          case 6:
            total = _context6.v;
            setSearchTotalCount(total);
            _context6.n = 8;
            break;
          case 7:
            _context6.p = 7;
            _t5 = _context6.v;
            console.error('[PlayerWindow] Search error:', _t5);
            setSearchResults([]);
          case 8:
            _context6.p = 8;
            setSearchLoading(false);
            return _context6.f(8);
          case 9:
            return _context6.a(2);
        }
      }, _callee6, null, [[1, 7, 8, 9]]);
    })), 300); // 300ms debounce
    return function () {
      return clearTimeout(timeoutId);
    };
  }, [searchQuery, searchScope, searchSort, searchLimit, selectedPlaylist, playlists, allVideos, filterByScope, sortResults]);
  // Queue management
  var handleClearQueue = function handleClearQueue() {
    if (currentVideo && isPlaying) {
      setQueue([currentVideo]);
      setQueueIndex(0);
    } else {
      setQueue([]);
      setQueueIndex(0);
    }
  };
  // Video click handler for search - opens popover to add to priority queue
  var handleVideoClick = React.useCallback(function (video, event) {
    event.stopPropagation();
    setPopoverVideo(video);
    setPopoverPosition({
      x: event.clientX,
      y: event.clientY
    });
  }, []);
  // Add video to priority queue (from popover)
  var handleAddToPriorityQueue = React.useCallback(function () {
    if (!popoverVideo) return;
    setPriorityQueue(function (prev) {
      return [].concat(_toConsumableArray(prev), [popoverVideo]);
    });
    // Sync to Supabase
    syncState({
      priorityQueue: [].concat(_toConsumableArray(priorityQueue), [popoverVideo])
    }, true);
    setPopoverVideo(null);
  }, [popoverVideo, priorityQueue, syncState]);
  var handleClosePopover = React.useCallback(function () {
    setPopoverVideo(null);
  }, []);
  // Settings
  var handleUpdateSetting = function handleUpdateSetting(key, value) {
    setSettings(function (prev) {
      return _objectSpread2(_objectSpread2({}, prev), {}, _defineProperty({}, key, value));
    });
    if (isElectron) {
      window.electronAPI.setSetting(key, value);
    }
  };
  // Video end handler - called when Player Window notifies us video ended
  // Uses refs to avoid stale closure issues with IPC listener
  var queueRef = React.useRef(queue);
  var queueIndexRef = React.useRef(queueIndex);
  var priorityQueueRef = React.useRef(priorityQueue);
  // Keep refs in sync with state
  React.useEffect(function () {
    queueRef.current = queue;
    queueIndexRef.current = queueIndex;
    priorityQueueRef.current = priorityQueue;
  }, [queue, queueIndex, priorityQueue]);
  // Calculate the next video that will play (for preloading)
  // Priority queue takes precedence, then active queue at next index
  var nextVideoToPreload = React.useMemo(function () {
    // If priority queue has items, that's what plays next
    if (priorityQueue.length > 0) {
      return priorityQueue[0];
    }
    // Otherwise, next in active queue
    if (queue.length > 0) {
      var nextIndex = queueIndex < queue.length - 1 ? queueIndex + 1 : 0;
      return queue[nextIndex];
    }
    return null;
  }, [priorityQueue, queue, queueIndex]);
  // Preload the next video when it changes (after current video starts playing)
  React.useEffect(function () {
    if (!nextVideoToPreload || !isElectron || !isPlaying) return;
    // Small delay to let current video start loading first
    var preloadTimer = setTimeout(function () {
      console.log('[PlayerWindow] 📥 Preloading next video:', nextVideoToPreload.title);
      window.electronAPI.controlPlayerWindow('preload', nextVideoToPreload);
    }, 1000); // 1 second delay after video starts
    return function () {
      return clearTimeout(preloadTimer);
    };
  }, [nextVideoToPreload, isElectron, isPlaying, currentVideo]); // Also re-preload when currentVideo changes
  var handleVideoEnd = React.useCallback(function () {
    console.log('[PlayerWindow] Video ended - calling playNextVideo');
    // Use unified playNextVideo which checks priority queue first
    playNextVideo();
  }, [playNextVideo]);
  // Set up IPC listener to receive video end events from Player Window
  React.useEffect(function () {
    var _window$electronAPI$o, _window$electronAPI, _window$electronAPI$o2, _window$electronAPI2;
    if (!isElectron) return;
    // Listen for video end events from Player Window
    var unsubscribeVideoEnd = (_window$electronAPI$o = (_window$electronAPI = window.electronAPI).onRequestNextVideo) === null || _window$electronAPI$o === void 0 ? void 0 : _window$electronAPI$o.call(_window$electronAPI, function () {
      handleVideoEnd();
    });
    // Listen for playback state updates from Player Window
    var unsubscribePlaybackState = (_window$electronAPI$o2 = (_window$electronAPI2 = window.electronAPI).onPlaybackStateSync) === null || _window$electronAPI$o2 === void 0 ? void 0 : _window$electronAPI$o2.call(_window$electronAPI2, function (state) {
      if (state) {
        if (typeof state.isPlaying === 'boolean') {
          setIsPlaying(state.isPlaying);
          // Mark player as ready once Player Window responds with playback state
          // This means the Player Window is loaded and communicating
          if (!playerReadyRef.current) {
            console.log('[PlayerWindow] Player Window is responding - marking ready');
            playerReadyRef.current = true;
            setPlayerReady(true);
          }
        }
        // Track playback time and duration for progress display
        if (typeof state.currentTime === 'number') {
          setPlaybackTime(state.currentTime);
        }
        if (typeof state.duration === 'number') {
          setPlaybackDuration(state.duration);
        }
      }
    });
    return function () {
      if (unsubscribeVideoEnd) unsubscribeVideoEnd();
      if (unsubscribePlaybackState) unsubscribePlaybackState();
    };
  }, [isElectron, handleVideoEnd]);
  // PLAYBACK WATCHDOG: Monitor player state and recover from stalled playback
  // This detects when the player is supposed to be playing but playback time isn't advancing
  React.useEffect(function () {
    if (!isElectron || !playerReady) return;
    // Clear any existing watchdog timer
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    // Start watchdog monitoring
    watchdogTimerRef.current = setInterval(function () {
      // Only monitor when we expect playback to be happening
      if (!isPlaying || !currentVideo) {
        watchdogCheckCountRef.current = 0;
        lastPlaybackTimeRef.current = 0;
        return;
      }
      var currentPlaybackTime = playbackTime;
      var currentDuration = playbackDuration;
      // Check if playback time is advancing
      var isTimeAdvancing = currentPlaybackTime > lastPlaybackTimeRef.current;
      var isNearEnd = currentDuration > 0 && currentPlaybackTime >= currentDuration - 0.5;
      var isAtStart = currentPlaybackTime < 1; // First second - give it time to start
      console.log("[Watchdog] Check: isPlaying=".concat(isPlaying, ", time=").concat(currentPlaybackTime.toFixed(1), "s, lastTime=").concat(lastPlaybackTimeRef.current.toFixed(1), "s, advancing=").concat(isTimeAdvancing, ", nearEnd=").concat(isNearEnd));
      if (!isTimeAdvancing && !isNearEnd && !isAtStart && currentPlaybackTime > 0) {
        // Playback appears stalled
        watchdogCheckCountRef.current++;
        console.warn("[Watchdog] \u26A0\uFE0F Playback stalled - check ".concat(watchdogCheckCountRef.current, "/").concat(WATCHDOG_MAX_STALL_CHECKS));
        if (watchdogCheckCountRef.current >= WATCHDOG_MAX_STALL_CHECKS) {
          console.error('[Watchdog] 🚨 PLAYBACK STALL DETECTED - Triggering recovery skip!');
          console.error("[Watchdog] Current video: ".concat(currentVideo === null || currentVideo === void 0 ? void 0 : currentVideo.title, ", time stuck at: ").concat(currentPlaybackTime.toFixed(1), "s"));
          // Reset watchdog state
          watchdogCheckCountRef.current = 0;
          lastPlaybackTimeRef.current = 0;
          // Force skip to next video (bypass normal debounce)
          lastPlayNextTimeRef.current = 0; // Clear debounce
          playNextVideo();
        }
      } else {
        // Playback is progressing normally - reset stall counter
        if (watchdogCheckCountRef.current > 0) {
          console.log('[Watchdog] ✅ Playback resumed, resetting stall counter');
        }
        watchdogCheckCountRef.current = 0;
        lastPlaybackTimeRef.current = currentPlaybackTime;
      }
    }, WATCHDOG_CHECK_INTERVAL_MS);
    return function () {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [isElectron, playerReady, isPlaying, currentVideo, playbackTime, playbackDuration, playNextVideo]);
  // Sync queue to Player Window for Supabase state sync
  // The Player Window will update Supabase with the queue state
  React.useEffect(function () {
    if (!isElectron) return;
    // Send queue update to Player Window
    window.electronAPI.controlPlayerWindow('updateQueue', {
      activeQueue: queue,
      priorityQueue: priorityQueue,
      queueIndex: queueIndex
    });
  }, [isElectron, queue, priorityQueue, queueIndex]);
  // Sync overlay settings to Player Window when they change
  React.useEffect(function () {
    if (!isElectron) return;
    console.log('[PlayerWindow] Sending overlay settings to player window:', overlaySettings);
    window.electronAPI.controlPlayerWindow('updateOverlaySettings', overlaySettings);
    // Save overlay settings to persistent storage
    window.electronAPI.setSetting('overlaySettings', overlaySettings);
  }, [isElectron, overlaySettings]);
  // Save kiosk settings when they change
  React.useEffect(function () {
    if (!isElectron) return;
    console.log('[PlayerWindow] Saving kiosk settings:', kioskSettings);
    window.electronAPI.setSetting('kioskSettings', kioskSettings);
  }, [isElectron, kioskSettings]);
  // Sync player state to Supabase when it changes
  // This ensures Web Admin / Kiosk see up-to-date state
  React.useEffect(function () {
    if (!supabaseInitialized) return;
    syncState({
      status: isPlaying ? 'playing' : 'paused',
      isPlaying: isPlaying,
      currentVideo: currentVideo,
      volume: volume / 100,
      activeQueue: queue,
      priorityQueue: priorityQueue,
      queueIndex: queueIndex
    });
  }, [supabaseInitialized, isPlaying, currentVideo, volume, queue, priorityQueue, queueIndex, syncState]);
  // Tools handlers
  React.useCallback(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7() {
    var displays, _t6;
    return _regenerator().w(function (_context7) {
      while (1) switch (_context7.p = _context7.n) {
        case 0:
          if (isElectron) {
            _context7.n = 1;
            break;
          }
          return _context7.a(2);
        case 1:
          _context7.p = 1;
          _context7.n = 2;
          return window.electronAPI.getDisplays();
        case 2:
          displays = _context7.v;
          if (!(displays.length > 1)) {
            _context7.n = 3;
            break;
          }
          _context7.n = 3;
          return window.electronAPI.createFullscreenWindow(displays[1].id);
        case 3:
          _context7.n = 5;
          break;
        case 4:
          _context7.p = 4;
          _t6 = _context7.v;
          console.error('Failed to open fullscreen:', _t6);
        case 5:
          return _context7.a(2);
      }
    }, _callee7, null, [[1, 4]]);
  })), [isElectron]);
  var handleRefreshPlaylists = React.useCallback(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8() {
    var _yield$window$electro2, newPlaylists;
    return _regenerator().w(function (_context8) {
      while (1) switch (_context8.n) {
        case 0:
          if (!isElectron) {
            _context8.n = 2;
            break;
          }
          _context8.n = 1;
          return window.electronAPI.getPlaylists();
        case 1:
          _yield$window$electro2 = _context8.v;
          newPlaylists = _yield$window$electro2.playlists;
          setPlaylists(newPlaylists || {});
          localSearchService.indexVideos(newPlaylists || {});
          // Re-index to Supabase
          window.electronAPI.controlPlayerWindow('indexPlaylists', newPlaylists || {});
        case 2:
          return _context8.a(2);
      }
    }, _callee8);
  })), [isElectron]);
  // Get playlist counts with display names (strips YouTube Playlist ID prefix)
  var getPlaylistList = function getPlaylistList() {
    return Object.entries(playlists).map(function (_ref10) {
      var _ref11 = _slicedToArray(_ref10, 2),
        name = _ref11[0],
        videos = _ref11[1];
      return {
        name: name,
        // Original folder name for internal use
        displayName: getPlaylistDisplayName(name),
        // Display name without YouTube ID prefix
        count: videos.length
      };
    });
  };
  // Get display name for active playlist
  var activePlaylistDisplayName = activePlaylist ? getPlaylistDisplayName(activePlaylist) : 'None';
  // Get display name for playlist to load in dialog
  var playlistToLoadDisplayName = playlistToLoad ? getPlaylistDisplayName(playlistToLoad) : '';
  var currentTrack = currentVideo;
  return /*#__PURE__*/React.createElement("div", {
    className: "app ".concat(className)
  }, /*#__PURE__*/React.createElement("link", {
    href: "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap",
    rel: "stylesheet"
  }), /*#__PURE__*/React.createElement("link", {
    href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
    rel: "stylesheet"
  }), showLoadDialog && (/*#__PURE__*/React.createElement("div", {
    className: "dialog-overlay",
    onClick: function onClick() {
      return setShowLoadDialog(false);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dialog-box",
    onClick: function onClick(e) {
      return e.stopPropagation();
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Load Playlist"), /*#__PURE__*/React.createElement("p", null, "Load playlist \"", playlistToLoadDisplayName, "\"?"), /*#__PURE__*/React.createElement("div", {
    className: "dialog-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn dialog-btn-primary",
    onClick: confirmLoadPlaylist
  }, "LOAD"), /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn",
    onClick: function onClick() {
      return setShowLoadDialog(false);
    }
  }, "CANCEL"))))), showPauseDialog && (/*#__PURE__*/React.createElement("div", {
    className: "dialog-overlay",
    onClick: function onClick() {
      return setShowPauseDialog(false);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dialog-box",
    onClick: function onClick(e) {
      return e.stopPropagation();
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Pause the Player?"), /*#__PURE__*/React.createElement("div", {
    className: "dialog-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn dialog-btn-primary",
    onClick: confirmPause
  }, "PAUSE"), /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn",
    onClick: function onClick() {
      return setShowPauseDialog(false);
    }
  }, "CANCEL"))))), showQueuePlayDialog && queueVideoToPlay && (/*#__PURE__*/React.createElement("div", {
    className: "dialog-overlay",
    onClick: function onClick() {
      setShowQueuePlayDialog(false);
      setQueueVideoToPlay(null);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dialog-box dialog-box-wide",
    onClick: function onClick(e) {
      return e.stopPropagation();
    }
  }, /*#__PURE__*/React.createElement("h3", null, cleanVideoTitle(queueVideoToPlay.video.title), queueVideoToPlay.video.artist ? " - ".concat(getDisplayArtist(queueVideoToPlay.video.artist)) : ''), /*#__PURE__*/React.createElement("div", {
    className: "dialog-actions dialog-actions-grid"
  }, /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn dialog-btn-primary",
    onClick: confirmQueuePlay
  }, "\u25B6 PLAY NOW"), /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn dialog-btn-secondary",
    onClick: moveQueueVideoToNext
  }, "\u23ED PLAY NEXT"), /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn dialog-btn-danger",
    onClick: removeQueueVideo
  }, "\u2715 REMOVE"), /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn",
    onClick: function onClick() {
      setShowQueuePlayDialog(false);
      setQueueVideoToPlay(null);
    }
  }, "CANCEL"))))), showSkipConfirmDialog && (/*#__PURE__*/React.createElement("div", {
    className: "dialog-overlay",
    onClick: function onClick() {
      return setShowSkipConfirmDialog(false);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dialog-box",
    onClick: function onClick(e) {
      return e.stopPropagation();
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Now playing from Priority Queue"), /*#__PURE__*/React.createElement("p", null, "Do you really want to skip this requested song?"), /*#__PURE__*/React.createElement("div", {
    className: "dialog-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn dialog-btn-warning",
    onClick: confirmSkip
  }, "SKIP"), /*#__PURE__*/React.createElement("button", {
    className: "dialog-btn",
    onClick: function onClick() {
      return setShowSkipConfirmDialog(false);
    }
  }, "CANCEL"))))), popoverVideo && (/*#__PURE__*/React.createElement("div", {
    className: "video-popover",
    style: {
      position: 'fixed',
      left: Math.min(popoverPosition.x, window.innerWidth - 320),
      top: Math.min(popoverPosition.y, window.innerHeight - 150),
      zIndex: 9999
    },
    onClick: function onClick(e) {
      return e.stopPropagation();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "popover-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "popover-title"
  }, getDisplayArtist(popoverVideo.artist) ? "".concat(getDisplayArtist(popoverVideo.artist), " - ").concat(cleanVideoTitle(popoverVideo.title)) : cleanVideoTitle(popoverVideo.title)), /*#__PURE__*/React.createElement("div", {
    className: "popover-subtitle"
  }, "Add to Priority Queue?")), /*#__PURE__*/React.createElement("div", {
    className: "popover-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "popover-btn popover-btn-cancel",
    onClick: handleClosePopover
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "popover-btn popover-btn-primary",
    onClick: handleAddToPriorityQueue
  }, "Add to Priority Queue")))), popoverVideo && /*#__PURE__*/React.createElement("div", {
    className: "popover-backdrop",
    onClick: handleClosePopover
  }), /*#__PURE__*/React.createElement("header", {
    className: "top-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "header-left"
  }, /*#__PURE__*/React.createElement("img", {
    src: "/icon.png",
    alt: "DJAMMS",
    className: "app-logo",
    style: {
      height: '40px',
      width: 'auto'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "header-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "active-playlist-info",
    title: "Click the green PLAY button on a highlighted Playlist in the left-hand menu to change Playlists"
  }, /*#__PURE__*/React.createElement("div", {
    className: "active-playlist-label"
  }, "Active Playlist"), /*#__PURE__*/React.createElement("div", {
    className: "active-playlist-name"
  }, activePlaylistDisplayName)), /*#__PURE__*/React.createElement("div", {
    className: "now-playing"
  }, /*#__PURE__*/React.createElement("div", {
    className: "album-art"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "track-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "track-title"
  }, (currentTrack === null || currentTrack === void 0 ? void 0 : currentTrack.title) || 'No track playing'), /*#__PURE__*/React.createElement("div", {
    className: "track-artist"
  }, getDisplayArtist(currentTrack === null || currentTrack === void 0 ? void 0 : currentTrack.artist) || '—')))), /*#__PURE__*/React.createElement("div", {
    className: "header-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "player-controls"
  }, /*#__PURE__*/React.createElement("button", {
    className: "control-btn control-btn-large ".concat(!playerReady ? 'disabled' : ''),
    onClick: skipTrack,
    disabled: !playerReady
  }, /*#__PURE__*/React.createElement("span", {
    className: "control-btn-label"
  }, "SKIP")), /*#__PURE__*/React.createElement("button", {
    className: "control-btn control-btn-large ".concat(!playerReady ? 'disabled' : ''),
    onClick: toggleShuffle,
    disabled: !playerReady
  }, /*#__PURE__*/React.createElement("span", {
    className: "control-btn-label"
  }, "SHUFFLE")), /*#__PURE__*/React.createElement("button", {
    className: "control-btn play-btn ".concat(!playerReady ? 'disabled' : ''),
    onClick: handlePauseClick,
    disabled: !playerReady
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, isPlaying ? 'pause' : 'play_arrow')), /*#__PURE__*/React.createElement("div", {
    className: "volume-control"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "volume_up"), /*#__PURE__*/React.createElement("input", {
    type: "range",
    value: volume,
    onChange: function onChange(e) {
      var newVolume = Number(e.target.value);
      setVolume(newVolume);
      // Send volume to Player Window (the ONLY player)
      if (isElectron) {
        window.electronAPI.controlPlayerWindow('setVolume', newVolume / 100);
        window.electronAPI.setSetting('volume', newVolume / 100);
      }
    },
    min: "0",
    max: "100"
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "priority-queue-bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "priority-queue-label"
  }, "Priority Queue:"), /*#__PURE__*/React.createElement("div", {
    className: "priority-queue-content"
  }, priorityQueue.length === 0 ? (/*#__PURE__*/React.createElement("span", {
    className: "priority-queue-empty"
  }, "Priority Queue is Empty...")) : (/*#__PURE__*/React.createElement("div", {
    className: "priority-queue-ticker"
  }, priorityQueue.map(function (item, idx) {
    return /*#__PURE__*/React.createElement("span", {
      key: "".concat(item.id, "-").concat(idx),
      className: "priority-queue-item"
    }, cleanVideoTitle(item.title), getDisplayArtist(item.artist) ? " - ".concat(getDisplayArtist(item.artist)) : '');
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "main-container"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "sidebar ".concat(sidebarCollapsed ? 'collapsed' : '')
  }, /*#__PURE__*/React.createElement("button", {
    className: "sidebar-toggle",
    onClick: function onClick() {
      return setSidebarCollapsed(!sidebarCollapsed);
    },
    title: sidebarCollapsed ? 'Expand Sidebar' : 'Hide Sidebar'
  }, sidebarCollapsed ? (/*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "chevron_right")) : (/*#__PURE__*/React.createElement("span", {
    className: "sidebar-toggle-text"
  }, "Hide Sidebar"))), /*#__PURE__*/React.createElement("nav", {
    className: "sidebar-nav"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nav-section"
  }, navItems.map(function (nav) {
    return /*#__PURE__*/React.createElement("button", {
      key: nav.id,
      className: "nav-item ".concat(currentTab === nav.id ? 'active' : ''),
      onClick: function onClick() {
        return handleTabChange(nav.id);
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "material-symbols-rounded"
    }, nav.icon), /*#__PURE__*/React.createElement("span", {
      className: "nav-label"
    }, nav.label));
  })), /*#__PURE__*/React.createElement("div", {
    className: "nav-separator"
  }), /*#__PURE__*/React.createElement("div", {
    className: "playlist-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "playlist-header",
    title: "Click the green PLAY button on a highlighted Playlist in the left-hand menu to change Playlists"
  }, /*#__PURE__*/React.createElement("span", {
    className: "playlist-header-label"
  }, "PLAYLISTS")), /*#__PURE__*/React.createElement("div", {
    className: "playlist-list"
  }, getPlaylistList().map(function (playlist) {
    return /*#__PURE__*/React.createElement("div", {
      key: playlist.name,
      className: "playlist-item ".concat(selectedPlaylist === playlist.name ? 'selected' : ''),
      onClick: function onClick() {
        return handlePlaylistClick(playlist.name);
      },
      onMouseEnter: function onMouseEnter() {
        return setHoveredPlaylist(playlist.name);
      },
      onMouseLeave: function onMouseLeave() {
        return setHoveredPlaylist(null);
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "material-symbols-rounded playlist-icon"
    }, "playlist_play"), /*#__PURE__*/React.createElement("span", {
      className: "playlist-name"
    }, selectedPlaylist === playlist.name ? "Selected: ".concat(playlist.displayName) : playlist.displayName), hoveredPlaylist === playlist.name && (/*#__PURE__*/React.createElement("button", {
      className: "playlist-play-btn",
      onClick: function onClick(e) {
        return handlePlayButtonClick(e, playlist.name);
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "material-symbols-rounded"
    }, "play_arrow"))), /*#__PURE__*/React.createElement("span", {
      className: "playlist-count"
    }, playlist.count));
  }))))), /*#__PURE__*/React.createElement("main", {
    className: "content-area"
  }, currentTab === 'queue' && (/*#__PURE__*/React.createElement("div", {
    className: "tab-content active"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tab-header"
  }, /*#__PURE__*/React.createElement("h1", null, "Queue")), /*#__PURE__*/React.createElement("div", {
    className: "table-container"
  }, currentVideo && (/*#__PURE__*/React.createElement("div", {
    className: "queue-section now-playing-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "queue-section-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "play_circle"), "NOW PLAYING"), /*#__PURE__*/React.createElement("div", {
    className: "now-playing-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "now-playing-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "now-playing-title"
  }, cleanVideoTitle(currentVideo.title)), /*#__PURE__*/React.createElement("div", {
    className: "now-playing-artist"
  }, getDisplayArtist(currentVideo.artist)), /*#__PURE__*/React.createElement("div", {
    className: "now-playing-playlist"
  }, currentVideo.playlistDisplayName || getPlaylistDisplayName(currentVideo.playlist || ''))), /*#__PURE__*/React.createElement("div", {
    className: "now-playing-progress"
  }, /*#__PURE__*/React.createElement("span", {
    className: "time-elapsed"
  }, Math.floor(playbackTime / 60), ":", String(Math.floor(playbackTime % 60)).padStart(2, '0')), /*#__PURE__*/React.createElement("div", {
    className: "progress-bar-container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "progress-bar-fill",
    style: {
      width: "".concat(playbackDuration > 0 ? playbackTime / playbackDuration * 100 : 0, "%")
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "time-remaining"
  }, "-", Math.floor((playbackDuration - playbackTime) / 60), ":", String(Math.floor((playbackDuration - playbackTime) % 60)).padStart(2, '0')))))), priorityQueue.length > 0 && (/*#__PURE__*/React.createElement("div", {
    className: "queue-section priority-queue-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "queue-section-header priority"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "priority_high"), "PRIORITY QUEUE"), /*#__PURE__*/React.createElement("table", {
    className: "media-table"
  }, /*#__PURE__*/React.createElement("tbody", null, priorityQueue.map(function (track, index) {
    return /*#__PURE__*/React.createElement("tr", {
      key: "priority-".concat(track.id, "-").concat(index),
      className: "priority-item"
    }, /*#__PURE__*/React.createElement("td", {
      className: "col-index"
    }, "P", index + 1), /*#__PURE__*/React.createElement("td", {
      className: "col-title"
    }, cleanVideoTitle(track.title)), /*#__PURE__*/React.createElement("td", null, getDisplayArtist(track.artist)), /*#__PURE__*/React.createElement("td", null, track.duration || '—'), /*#__PURE__*/React.createElement("td", null, track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')));
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "queue-section active-queue-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "queue-section-header"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "queue_music"), "UP NEXT"), /*#__PURE__*/React.createElement("table", {
    className: "media-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "col-index"
  }, "#"), /*#__PURE__*/React.createElement("th", {
    className: "col-title"
  }, "Title"), /*#__PURE__*/React.createElement("th", {
    className: "col-artist"
  }, "Artist"), /*#__PURE__*/React.createElement("th", {
    className: "col-duration"
  }, "Duration"), /*#__PURE__*/React.createElement("th", {
    className: "col-playlist"
  }, "Playlist"))), /*#__PURE__*/React.createElement("tbody", null, queue.length === 0 ? (/*#__PURE__*/React.createElement("tr", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("td", {
    colSpan: 5
  }, "Queue is empty. Add tracks from Search."))) : function () {
    // Reorder: videos after current index first ("up next"), then videos before ("already played")
    var upNextVideos = queue.slice(queueIndex + 1).map(function (track, idx) {
      return {
        track: track,
        originalIndex: queueIndex + 1 + idx,
        isUpNext: true
      };
    });
    var alreadyPlayedVideos = queue.slice(0, queueIndex).map(function (track, idx) {
      return {
        track: track,
        originalIndex: idx,
        isUpNext: false
      };
    });
    var reorderedQueue = [].concat(_toConsumableArray(upNextVideos), _toConsumableArray(alreadyPlayedVideos));
    if (reorderedQueue.length === 0) {
      return /*#__PURE__*/React.createElement("tr", {
        className: "empty-state"
      }, /*#__PURE__*/React.createElement("td", {
        colSpan: 5
      }, "No more tracks in queue."));
    }
    return reorderedQueue.map(function (_ref12, displayIndex) {
      var track = _ref12.track,
        originalIndex = _ref12.originalIndex,
        isUpNext = _ref12.isUpNext;
      return /*#__PURE__*/React.createElement("tr", {
        key: "queue-".concat(track.id, "-").concat(originalIndex),
        className: !isUpNext ? 'played' : '',
        onClick: function onClick() {
          return handleQueueItemClick(originalIndex);
        }
      }, /*#__PURE__*/React.createElement("td", null, displayIndex + 1), /*#__PURE__*/React.createElement("td", {
        className: "col-title"
      }, cleanVideoTitle(track.title)), /*#__PURE__*/React.createElement("td", null, getDisplayArtist(track.artist)), /*#__PURE__*/React.createElement("td", null, track.duration || '—'), /*#__PURE__*/React.createElement("td", null, track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')));
    });
  }())))))), currentTab === 'search' && (/*#__PURE__*/React.createElement("div", {
    className: "tab-content active"
  }, /*#__PURE__*/React.createElement("div", {
    className: "search-header",
    style: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: '12px',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "search-input-container",
    style: {
      flex: '1 1 300px',
      minWidth: '200px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded search-icon"
  }, "search"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Search all music\u2026",
    className: "search-input",
    value: searchQuery,
    onChange: function onChange(e) {
      setSearchQuery(e.target.value);
      setSearchLimit(100); // Reset pagination when query changes
    }
  }), searchLoading && /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded loading-icon",
    style: {
      marginLeft: '8px',
      animation: 'spin 1s linear infinite'
    }
  }, "progress_activity")), /*#__PURE__*/React.createElement("div", {
    className: "search-radio-group",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '12px',
      marginRight: '4px'
    }
  }, "Filter:"), selectedPlaylist && (/*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(searchScope === 'playlist' ? 'active' : ''),
    onClick: function onClick() {
      return handleScopeChange('playlist');
    },
    style: {
      fontWeight: searchScope === 'playlist' ? 'bold' : 'normal'
    }
  }, "\uD83D\uDCC1 ", getPlaylistDisplayName(selectedPlaylist))), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(searchScope === 'all' ? 'active' : ''),
    onClick: function onClick() {
      return handleScopeChange('all');
    }
  }, "All Music"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(searchScope === 'karaoke' ? 'active' : ''),
    onClick: function onClick() {
      return handleScopeChange('karaoke');
    }
  }, "Karaoke Only"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(searchScope === 'no-karaoke' ? 'active' : ''),
    onClick: function onClick() {
      return handleScopeChange('no-karaoke');
    }
  }, "Hide Karaoke")), /*#__PURE__*/React.createElement("div", {
    className: "search-radio-group",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '12px',
      marginRight: '4px'
    }
  }, "Sort:"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(searchSort === 'artist' ? 'active' : ''),
    onClick: function onClick() {
      return setSearchSort('artist');
    }
  }, "Artist"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(searchSort === 'az' || searchSort === 'title' ? 'active' : ''),
    onClick: function onClick() {
      return setSearchSort('az');
    }
  }, "Song"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(searchSort === 'playlist' ? 'active' : ''),
    onClick: function onClick() {
      return setSearchSort('playlist');
    }
  }, "Playlist"))), /*#__PURE__*/React.createElement("div", {
    className: "table-container"
  }, /*#__PURE__*/React.createElement("table", {
    className: "media-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "col-index"
  }, "#"), /*#__PURE__*/React.createElement("th", {
    className: "col-title"
  }, "Title"), /*#__PURE__*/React.createElement("th", {
    className: "col-artist"
  }, "Artist"), /*#__PURE__*/React.createElement("th", {
    className: "col-duration"
  }, "Duration"), /*#__PURE__*/React.createElement("th", {
    className: "col-playlist"
  }, "Playlist"))), /*#__PURE__*/React.createElement("tbody", null, searchLoading && searchResults.length === 0 ? (/*#__PURE__*/React.createElement("tr", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("td", {
    colSpan: 5
  }, "Loading..."))) : searchResults.length === 0 ? (/*#__PURE__*/React.createElement("tr", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("td", {
    colSpan: 5
  }, searchScope === 'playlist' && selectedPlaylist ? 'No tracks in this playlist' : 'No tracks found'))) : searchResults.map(function (track, index) {
    return /*#__PURE__*/React.createElement("tr", {
      key: "".concat(track.id, "-").concat(index),
      onClick: function onClick(e) {
        return handleVideoClick(track, e);
      },
      style: {
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("td", null, index + 1), /*#__PURE__*/React.createElement("td", {
      className: "col-title"
    }, cleanVideoTitle(track.title)), /*#__PURE__*/React.createElement("td", null, getDisplayArtist(track.artist)), /*#__PURE__*/React.createElement("td", null, track.duration || '—'), /*#__PURE__*/React.createElement("td", null, track.playlistDisplayName || getPlaylistDisplayName(track.playlist || '')));
  }))), searchTotalCount > searchResults.length && (/*#__PURE__*/React.createElement("div", {
    className: "load-more-container",
    style: {
      padding: '12px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    onClick: function onClick() {
      return setSearchLimit(function (prev) {
        return prev + 100;
      });
    },
    style: {
      marginRight: '8px'
    },
    disabled: searchLoading
  }, searchLoading ? 'Loading...' : "Load More (".concat(searchTotalCount - searchResults.length, " remaining)")), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '12px'
    }
  }, "Showing ", searchResults.length, " of ", searchTotalCount, " tracks")))))), currentTab === 'settings' && (/*#__PURE__*/React.createElement("div", {
    className: "tab-content active"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settings-container"
  }, /*#__PURE__*/React.createElement("h1", null, "Settings"), /*#__PURE__*/React.createElement("div", {
    className: "settings-section"
  }, /*#__PURE__*/React.createElement("h2", null, /*#__PURE__*/React.createElement("span", {
    className: "section-icon"
  }, "\uD83C\uDD94"), " Player Identity"), /*#__PURE__*/React.createElement(PlayerIdSetting, {
    playerId: playerId,
    onPlayerIdChange: function onPlayerIdChange(newId) {
      setPlayerId(newId);
      setPlayerId$1(newId);
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "settings-section"
  }, /*#__PURE__*/React.createElement("h2", null, /*#__PURE__*/React.createElement("span", {
    className: "section-icon"
  }, "\uD83D\uDCC1"), " Library"), /*#__PURE__*/React.createElement("div", {
    className: "setting-item playlists-path-setting"
  }, /*#__PURE__*/React.createElement("label", null, "Playlists Folder"), /*#__PURE__*/React.createElement("div", {
    className: "path-input-container"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "path-input",
    value: settings.playlistsDirectory,
    readOnly: true,
    title: settings.playlistsDirectory
  }), /*#__PURE__*/React.createElement("button", {
    className: "action-btn select-folder-btn",
    onClick: function () {
      var _onClick = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9() {
        var result, _yield$window$electro3, newPlaylists, _t7;
        return _regenerator().w(function (_context9) {
          while (1) switch (_context9.p = _context9.n) {
            case 0:
              if (!isElectron) {
                _context9.n = 6;
                break;
              }
              _context9.p = 1;
              _context9.n = 2;
              return window.electronAPI.selectPlaylistsDirectory();
            case 2:
              result = _context9.v;
              if (!result.success) {
                _context9.n = 4;
                break;
              }
              setSettings(function (s) {
                return _objectSpread2(_objectSpread2({}, s), {}, {
                  playlistsDirectory: result.path
                });
              });
              // Refresh playlists with new directory
              _context9.n = 3;
              return window.electronAPI.getPlaylists();
            case 3:
              _yield$window$electro3 = _context9.v;
              newPlaylists = _yield$window$electro3.playlists;
              setPlaylists(newPlaylists || {});
              localSearchService.indexVideos(newPlaylists || {});
              // Re-index to Supabase so Web Admin gets the updated playlists
              window.electronAPI.controlPlayerWindow('indexPlaylists', newPlaylists || {});
            case 4:
              _context9.n = 6;
              break;
            case 5:
              _context9.p = 5;
              _t7 = _context9.v;
              console.error('Failed to select playlists directory:', _t7);
            case 6:
              return _context9.a(2);
          }
        }, _callee9, null, [[1, 5]]);
      }));
      function onClick() {
        return _onClick.apply(this, arguments);
      }
      return onClick;
    }()
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "folder_open"), "Select Folder")))), /*#__PURE__*/React.createElement("div", {
    className: "settings-section"
  }, /*#__PURE__*/React.createElement("h2", null, "Playback"), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Auto-shuffle playlists"), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: settings.autoShufflePlaylists,
    onChange: function onChange(e) {
      return handleUpdateSetting('autoShufflePlaylists', e.target.checked);
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Crossfade duration"), /*#__PURE__*/React.createElement("div", {
    className: "crossfade-slider-container"
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "crossfade-slider",
    value: settings.fadeDuration,
    onChange: function onChange(e) {
      return handleUpdateSetting('fadeDuration', Number(e.target.value));
    },
    min: "0",
    max: "5",
    step: "1"
  }), /*#__PURE__*/React.createElement("span", {
    className: "crossfade-value"
  }, settings.fadeDuration.toFixed(1), "s"))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Normalize audio levels"), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: settings.normalizeAudioLevels,
    onChange: function onChange(e) {
      return handleUpdateSetting('normalizeAudioLevels', e.target.checked);
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "settings-section player-display-section"
  }, /*#__PURE__*/React.createElement("h2", null, /*#__PURE__*/React.createElement("span", {
    className: "section-icon"
  }, "\uD83C\uDFAC"), " Player Display Settings"), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Show Player Window"), /*#__PURE__*/React.createElement("div", {
    className: "toggle-with-status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "status-indicator ".concat(playerWindowOpen ? 'active' : '')
  }, playerWindowOpen ? 'Open' : 'Closed'), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: settings.enableFullscreenPlayer,
    onChange: function () {
      var _onChange = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee0(e) {
        var enabled, _t8;
        return _regenerator().w(function (_context0) {
          while (1) switch (_context0.p = _context0.n) {
            case 0:
              enabled = e.target.checked;
              handleUpdateSetting('enableFullscreenPlayer', enabled);
              if (!isElectron) {
                _context0.n = 7;
                break;
              }
              _context0.p = 1;
              if (!(enabled && !playerWindowOpen)) {
                _context0.n = 3;
                break;
              }
              _context0.n = 2;
              return window.electronAPI.createPlayerWindow(settings.playerDisplayId);
            case 2:
              setPlayerWindowOpen(true);
              _context0.n = 5;
              break;
            case 3:
              if (!(!enabled && playerWindowOpen)) {
                _context0.n = 5;
                break;
              }
              _context0.n = 4;
              return window.electronAPI.closePlayerWindow();
            case 4:
              setPlayerWindowOpen(false);
            case 5:
              _context0.n = 7;
              break;
            case 6:
              _context0.p = 6;
              _t8 = _context0.v;
              console.error('Failed to toggle player window:', _t8);
            case 7:
              return _context0.a(2);
          }
        }, _callee0, null, [[1, 6]]);
      }));
      function onChange(_x2) {
        return _onChange.apply(this, arguments);
      }
      return onChange;
    }()
  }))), /*#__PURE__*/React.createElement("div", {
    className: "conditional-settings ".concat(settings.enableFullscreenPlayer ? 'visible' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Player Location"), /*#__PURE__*/React.createElement("div", {
    className: "display-selector"
  }, /*#__PURE__*/React.createElement("select", {
    className: "setting-select",
    value: (_settings$playerDispl = settings.playerDisplayId) !== null && _settings$playerDispl !== void 0 ? _settings$playerDispl : '',
    onChange: function () {
      var _onChange2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee1(e) {
        var displayId, _t9;
        return _regenerator().w(function (_context1) {
          while (1) switch (_context1.p = _context1.n) {
            case 0:
              displayId = e.target.value ? Number(e.target.value) : null;
              handleUpdateSetting('playerDisplayId', displayId);
              // If player window is open, move it to the new display (don't recreate)
              if (!(isElectron && playerWindowOpen && displayId !== null)) {
                _context1.n = 4;
                break;
              }
              _context1.p = 1;
              _context1.n = 2;
              return window.electronAPI.movePlayerToDisplay(displayId);
            case 2:
              _context1.n = 4;
              break;
            case 3:
              _context1.p = 3;
              _t9 = _context1.v;
              console.error('Failed to move player window:', _t9);
            case 4:
              return _context1.a(2);
          }
        }, _callee1, null, [[1, 3]]);
      }));
      function onChange(_x3) {
        return _onChange2.apply(this, arguments);
      }
      return onChange;
    }()
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Auto (Secondary Display)"), availableDisplays.map(function (display) {
    return /*#__PURE__*/React.createElement("option", {
      key: display.id,
      value: display.id
    }, display.isPrimary ? '⭐ ' : '', display.label || "Display ".concat(display.id));
  })), /*#__PURE__*/React.createElement("small", {
    className: "display-info"
  }, function () {
    var selectedDisplay = settings.playerDisplayId ? availableDisplays.find(function (d) {
      return d.id === settings.playerDisplayId;
    }) : availableDisplays.find(function (d) {
      return !d.isPrimary;
    }) || availableDisplays[0];
    if (selectedDisplay) {
      return "Current: ".concat(selectedDisplay.label || 'Display', " (").concat(selectedDisplay.width, "\xD7").concat(selectedDisplay.height, ")");
    }
    return "".concat(availableDisplays.length, " display(s) available");
  }()))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Fullscreen Player"), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: settings.playerFullscreen,
    onChange: function () {
      var _onChange3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee10(e) {
        var fullscreen, _t0;
        return _regenerator().w(function (_context10) {
          while (1) switch (_context10.p = _context10.n) {
            case 0:
              fullscreen = e.target.checked;
              handleUpdateSetting('playerFullscreen', fullscreen);
              // Directly set fullscreen on the player window
              if (!(isElectron && playerWindowOpen)) {
                _context10.n = 4;
                break;
              }
              _context10.p = 1;
              _context10.n = 2;
              return window.electronAPI.setPlayerFullscreen(fullscreen);
            case 2:
              _context10.n = 4;
              break;
            case 3:
              _context10.p = 3;
              _t0 = _context10.v;
              console.error('Failed to set fullscreen:', _t0);
            case 4:
              return _context10.a(2);
          }
        }, _callee10, null, [[1, 3]]);
      }));
      function onChange(_x4) {
        return _onChange3.apply(this, arguments);
      }
      return onChange;
    }()
  })), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Display Detection"), /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    onClick: function () {
      var _onClick2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee11() {
        var displays;
        return _regenerator().w(function (_context11) {
          while (1) switch (_context11.n) {
            case 0:
              if (!isElectron) {
                _context11.n = 2;
                break;
              }
              _context11.n = 1;
              return window.electronAPI.getDisplays();
            case 1:
              displays = _context11.v;
              setAvailableDisplays(displays || []);
            case 2:
              return _context11.a(2);
          }
        }, _callee11);
      }));
      function onClick() {
        return _onClick2.apply(this, arguments);
      }
      return onClick;
    }()
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "refresh"), "Refresh Displays")), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Refresh Player"), /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    onClick: function () {
      var _onClick3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee12() {
        var _t1;
        return _regenerator().w(function (_context12) {
          while (1) switch (_context12.p = _context12.n) {
            case 0:
              if (!(isElectron && playerWindowOpen)) {
                _context12.n = 4;
                break;
              }
              _context12.p = 1;
              _context12.n = 2;
              return window.electronAPI.refreshPlayerWindow(settings.playerDisplayId);
            case 2:
              // Re-sync the current video after a short delay
              setTimeout(function () {
                if (currentVideo) {
                  sendPlayCommand(currentVideo);
                }
              }, 500);
              _context12.n = 4;
              break;
            case 3:
              _context12.p = 3;
              _t1 = _context12.v;
              console.error('Failed to refresh player window:', _t1);
            case 4:
              return _context12.a(2);
          }
        }, _callee12, null, [[1, 3]]);
      }));
      function onClick() {
        return _onClick3.apply(this, arguments);
      }
      return onClick;
    }(),
    disabled: !playerWindowOpen
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "restart_alt"), "Refresh Player")))), /*#__PURE__*/React.createElement("div", {
    className: "settings-section"
  }, /*#__PURE__*/React.createElement("h2", null, /*#__PURE__*/React.createElement("span", {
    className: "section-icon"
  }, "\uD83C\uDFAC"), " Player Overlay"), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "'Now Playing' Text"), /*#__PURE__*/React.createElement("div", {
    className: "search-radio-group",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(!overlaySettings.showNowPlaying ? 'active' : ''),
    onClick: function onClick() {
      return setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          showNowPlaying: false
        });
      });
    }
  }, "Hide"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(overlaySettings.showNowPlaying ? 'active' : ''),
    onClick: function onClick() {
      return setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          showNowPlaying: true
        });
      });
    }
  }, "Show"))), /*#__PURE__*/React.createElement("div", {
    className: "conditional-settings ".concat(overlaySettings.showNowPlaying ? 'visible' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Now Playing Position & Size"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "Size:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "10",
    max: "200",
    value: overlaySettings.nowPlayingSize,
    onChange: function onChange(e) {
      var value = Math.min(200, Math.max(10, parseInt(e.target.value) || 100));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          nowPlayingSize: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "X:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "99",
    value: overlaySettings.nowPlayingX,
    onChange: function onChange(e) {
      var value = Math.min(99, Math.max(1, parseInt(e.target.value) || 5));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          nowPlayingX: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "Y:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "99",
    value: overlaySettings.nowPlayingY,
    onChange: function onChange(e) {
      var value = Math.min(99, Math.max(1, parseInt(e.target.value) || 85));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          nowPlayingY: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "Opacity:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "10",
    max: "100",
    value: overlaySettings.nowPlayingOpacity,
    onChange: function onChange(e) {
      var value = Math.min(100, Math.max(10, parseInt(e.target.value) || 100));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          nowPlayingOpacity: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%"))))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "'Coming Up' Ticker"), /*#__PURE__*/React.createElement("div", {
    className: "search-radio-group",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(!overlaySettings.showComingUp ? 'active' : ''),
    onClick: function onClick() {
      return setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          showComingUp: false
        });
      });
    }
  }, "Hide"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(overlaySettings.showComingUp ? 'active' : ''),
    onClick: function onClick() {
      return setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          showComingUp: true
        });
      });
    }
  }, "Show"))), /*#__PURE__*/React.createElement("div", {
    className: "conditional-settings ".concat(overlaySettings.showComingUp ? 'visible' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Coming Up Position & Size"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "Size:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "10",
    max: "200",
    value: overlaySettings.comingUpSize,
    onChange: function onChange(e) {
      var value = Math.min(200, Math.max(10, parseInt(e.target.value) || 100));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          comingUpSize: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "X:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "99",
    value: overlaySettings.comingUpX,
    onChange: function onChange(e) {
      var value = Math.min(99, Math.max(1, parseInt(e.target.value) || 5));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          comingUpX: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "Y:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "99",
    value: overlaySettings.comingUpY,
    onChange: function onChange(e) {
      var value = Math.min(99, Math.max(1, parseInt(e.target.value) || 95));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          comingUpY: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "Opacity:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "10",
    max: "100",
    value: overlaySettings.comingUpOpacity,
    onChange: function onChange(e) {
      var value = Math.min(100, Math.max(10, parseInt(e.target.value) || 100));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          comingUpOpacity: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%"))))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Watermark / Logo"), /*#__PURE__*/React.createElement("div", {
    className: "search-radio-group",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(!overlaySettings.showWatermark ? 'active' : ''),
    onClick: function onClick() {
      return setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          showWatermark: false
        });
      });
    }
  }, "Off"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(overlaySettings.showWatermark ? 'active' : ''),
    onClick: function onClick() {
      return setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          showWatermark: true
        });
      });
    }
  }, "On"))), /*#__PURE__*/React.createElement("div", {
    className: "conditional-settings ".concat(overlaySettings.showWatermark ? 'visible' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Image"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, overlaySettings.watermarkImage && (/*#__PURE__*/React.createElement("div", {
    className: "watermark-preview",
    style: {
      width: '60px',
      height: '60px',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid var(--border-color)',
      background: '#1a1a1a'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: overlaySettings.watermarkImage,
    alt: "Watermark preview",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'contain'
    }
  }))), /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    onClick: function () {
      var _onClick4 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee13() {
        var result, input, _t10;
        return _regenerator().w(function (_context13) {
          while (1) switch (_context13.p = _context13.n) {
            case 0:
              if (!isElectron) {
                _context13.n = 5;
                break;
              }
              _context13.p = 1;
              _context13.n = 2;
              return window.electronAPI.selectImageFile();
            case 2:
              result = _context13.v;
              if (result && result.filePath) {
                setOverlaySettings(function (prev) {
                  return _objectSpread2(_objectSpread2({}, prev), {}, {
                    watermarkImage: result.filePath
                  });
                });
              }
              _context13.n = 4;
              break;
            case 3:
              _context13.p = 3;
              _t10 = _context13.v;
              console.error('Failed to select image:', _t10);
            case 4:
              _context13.n = 6;
              break;
            case 5:
              // Web fallback - use file input
              input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = function (e) {
                var _e$target$files;
                var file = (_e$target$files = e.target.files) === null || _e$target$files === void 0 ? void 0 : _e$target$files[0];
                if (file) {
                  var reader = new FileReader();
                  reader.onload = function (ev) {
                    setOverlaySettings(function (prev) {
                      var _ev$target;
                      return _objectSpread2(_objectSpread2({}, prev), {}, {
                        watermarkImage: (_ev$target = ev.target) === null || _ev$target === void 0 ? void 0 : _ev$target.result
                      });
                    });
                  };
                  reader.readAsDataURL(file);
                }
              };
              input.click();
            case 6:
              return _context13.a(2);
          }
        }, _callee13, null, [[1, 3]]);
      }));
      function onClick() {
        return _onClick4.apply(this, arguments);
      }
      return onClick;
    }()
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "image"), "Select Image"), overlaySettings.watermarkImage && overlaySettings.watermarkImage !== './Obie_neon_no_BG.png' && (/*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    style: {
      backgroundColor: 'var(--warning)'
    },
    onClick: function onClick() {
      return setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          watermarkImage: './Obie_neon_no_BG.png'
        });
      });
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "restart_alt"), "Reset")))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Image Size"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "400",
    value: overlaySettings.watermarkSize,
    onChange: function onChange(e) {
      var value = Math.min(400, Math.max(1, parseInt(e.target.value) || 100));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          watermarkSize: value
        });
      });
    },
    style: {
      width: '70px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%"), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "1",
    max: "400",
    value: overlaySettings.watermarkSize,
    onChange: function onChange(e) {
      return setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          watermarkSize: parseInt(e.target.value)
        });
      });
    },
    style: {
      flex: 1,
      maxWidth: '150px'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Image Position"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "X:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "99",
    value: overlaySettings.watermarkX,
    onChange: function onChange(e) {
      var value = Math.min(99, Math.max(1, parseInt(e.target.value) || 90));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          watermarkX: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '13px'
    }
  }, "Y:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "99",
    value: overlaySettings.watermarkY,
    onChange: function onChange(e) {
      var value = Math.min(99, Math.max(1, parseInt(e.target.value) || 10));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          watermarkY: value
        });
      });
    },
    style: {
      width: '55px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%"))), /*#__PURE__*/React.createElement("small", {
    style: {
      color: 'var(--text-secondary)',
      marginTop: '4px',
      display: 'block'
    }
  }, "Position is relative to player window (center of image). Default: X=90%, Y=10%")), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Image Opacity"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "10",
    max: "100",
    value: overlaySettings.watermarkOpacity,
    onChange: function onChange(e) {
      var value = Math.min(100, Math.max(10, parseInt(e.target.value) || 80));
      setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          watermarkOpacity: value
        });
      });
    },
    style: {
      width: '70px',
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }
  }), /*#__PURE__*/React.createElement("span", null, "%"), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "10",
    max: "100",
    value: overlaySettings.watermarkOpacity,
    onChange: function onChange(e) {
      return setOverlaySettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          watermarkOpacity: parseInt(e.target.value)
        });
      });
    },
    style: {
      flex: 1,
      maxWidth: '150px'
    }
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "settings-section"
  }, /*#__PURE__*/React.createElement("h2", null, /*#__PURE__*/React.createElement("span", {
    className: "section-icon"
  }, "\uD83C\uDFB0"), " Kiosk"), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Kiosk Mode"), /*#__PURE__*/React.createElement("div", {
    className: "search-radio-group",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(kioskSettings.mode === 'freeplay' ? 'active' : ''),
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          mode: 'freeplay'
        });
      });
    }
  }, "Free Play"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(kioskSettings.mode === 'credits' ? 'active' : ''),
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          mode: 'credits'
        });
      });
    }
  }, "Credits"))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Kiosk UI Style"), /*#__PURE__*/React.createElement("div", {
    className: "search-radio-group",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(kioskSettings.uiMode === 'classic' ? 'active' : ''),
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          uiMode: 'classic'
        });
      });
    }
  }, "Classic"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(kioskSettings.uiMode === 'jukebox' ? 'active' : ''),
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          uiMode: 'jukebox'
        });
      });
    }
  }, "Jukebox")), /*#__PURE__*/React.createElement("span", {
    className: "setting-hint",
    style: {
      marginLeft: '12px',
      fontSize: '12px',
      color: 'var(--text-secondary)'
    }
  }, kioskSettings.uiMode === 'classic' ? 'Standard search interface' : 'Premium cyber-neon touchscreen UI')), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Kiosk Balance"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "kiosk-balance",
    style: {
      fontSize: '18px',
      fontWeight: 'bold',
      color: 'var(--accent-primary)',
      minWidth: '60px'
    }
  }, kioskSettings.creditBalance, " Credits"), /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          creditBalance: prev.creditBalance + 1
        });
      });
    }
  }, "+1"), /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          creditBalance: prev.creditBalance + 3
        });
      });
    }
  }, "+3"), /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    style: {
      backgroundColor: 'var(--error)'
    },
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          creditBalance: 0
        });
      });
    }
  }, "Clear (0)"))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Coin Acceptor Status"), /*#__PURE__*/React.createElement("span", {
    className: "status-indicator ".concat(kioskSerialStatus === 'connected' ? 'active' : ''),
    style: {
      marginRight: '12px'
    }
  }, kioskSerialStatus === 'connected' ? 'SERIAL DEVICE CONNECTED' : 'SERIAL DEVICE DISCONNECTED')), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Serial Devices"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    onClick: function onClick() {
      // TODO: Send command via Supabase to Kiosk to enumerate serial devices
      console.log('[Kiosk] Requesting serial device list from Kiosk...');
      // Placeholder - will be populated by Kiosk via Supabase
      setKioskAvailableSerialDevices(['COM1', 'COM3', '/dev/ttyUSB0']);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "usb"), "List Available Devices")), /*#__PURE__*/React.createElement("select", {
    className: "setting-select",
    value: kioskSelectedSerialDevice,
    onChange: function onChange(e) {
      return setKioskSelectedSerialDevice(e.target.value);
    },
    style: {
      maxWidth: '300px'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Select a device..."), kioskAvailableSerialDevices.map(function (device) {
    return /*#__PURE__*/React.createElement("option", {
      key: device,
      value: device
    }, device);
  })), /*#__PURE__*/React.createElement("button", {
    className: "action-btn",
    onClick: function onClick() {
      if (kioskSelectedSerialDevice) {
        // TODO: Send command via Supabase to Kiosk to connect to selected device
        console.log('[Kiosk] Requesting connection to:', kioskSelectedSerialDevice);
        // Kiosk will update status via Supabase after attempting connection
      }
    },
    disabled: !kioskSelectedSerialDevice
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "link"), "Connect to Selected Device"))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Search All Music"), /*#__PURE__*/React.createElement("div", {
    className: "search-radio-group",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(kioskSettings.searchAllMusic ? 'active' : ''),
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          searchAllMusic: true
        });
      });
    }
  }, "Yes"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(!kioskSettings.searchAllMusic ? 'active' : ''),
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          searchAllMusic: false
        });
      });
    }
  }, "No"))), /*#__PURE__*/React.createElement("div", {
    className: "setting-item"
  }, /*#__PURE__*/React.createElement("label", null, "Search YouTube ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)',
      fontSize: '11px'
    }
  }, "(future)")), /*#__PURE__*/React.createElement("div", {
    className: "search-radio-group",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(kioskSettings.searchYoutube ? 'active' : ''),
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          searchYoutube: true
        });
      });
    }
  }, "Yes"), /*#__PURE__*/React.createElement("button", {
    className: "radio-btn ".concat(!kioskSettings.searchYoutube ? 'active' : ''),
    onClick: function onClick() {
      return setKioskSettings(function (prev) {
        return _objectSpread2(_objectSpread2({}, prev), {}, {
          searchYoutube: false
        });
      });
    }
  }, "No"))))))), currentTab === 'tools' && (/*#__PURE__*/React.createElement("div", {
    className: "tab-content active"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tools-container"
  }, /*#__PURE__*/React.createElement("h2", null, "Toolkit"), /*#__PURE__*/React.createElement("p", null, "Utility tools for managing your music library and player."), /*#__PURE__*/React.createElement("div", {
    className: "tools-grid"
  }, isElectron && (/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "tool-card",
    onClick: handleRefreshPlaylists
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "refresh"), /*#__PURE__*/React.createElement("h3", null, "Refresh Playlists"), /*#__PURE__*/React.createElement("p", null, "Rescan the playlists directory")))), /*#__PURE__*/React.createElement("div", {
    className: "tool-card",
    onClick: handleClearQueue
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "clear_all"), /*#__PURE__*/React.createElement("h3", null, "Clear Queue"), /*#__PURE__*/React.createElement("p", null, "Remove all tracks from the queue")), /*#__PURE__*/React.createElement("div", {
    className: "tool-card disabled"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "edit"), /*#__PURE__*/React.createElement("h3", null, "Batch Tag Editor"), /*#__PURE__*/React.createElement("p", null, "Edit metadata for multiple files")), /*#__PURE__*/React.createElement("div", {
    className: "tool-card disabled"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "content_copy"), /*#__PURE__*/React.createElement("h3", null, "Duplicate Finder"), /*#__PURE__*/React.createElement("p", null, "Find and manage duplicate tracks")), /*#__PURE__*/React.createElement("div", {
    className: "tool-card disabled"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-rounded"
  }, "analytics"), /*#__PURE__*/React.createElement("h3", null, "Library Stats"), /*#__PURE__*/React.createElement("p", null, "View detailed library statistics")))))))));
};

var AdminConsole = function AdminConsole(_ref) {
  var _ref$className = _ref.className,
    className = _ref$className === void 0 ? '' : _ref$className;
  // Data state
  var _useState = React.useState({}),
    _useState2 = _slicedToArray(_useState, 2),
    playlists = _useState2[0],
    setPlaylists = _useState2[1];
  var _useState3 = React.useState(''),
    _useState4 = _slicedToArray(_useState3, 2),
    playlistsDirectory = _useState4[0],
    setPlaylistsDirectory = _useState4[1];
  var _useState5 = React.useState([]),
    _useState6 = _slicedToArray(_useState5, 2),
    searchResults = _useState6[0],
    setSearchResults = _useState6[1];
  var _useState7 = React.useState(''),
    _useState8 = _slicedToArray(_useState7, 2),
    searchQuery = _useState8[0],
    setSearchQuery = _useState8[1];
  var _useState9 = React.useState(false),
    _useState0 = _slicedToArray(_useState9, 2),
    isSearching = _useState0[0],
    setIsSearching = _useState0[1];
  var _useState1 = React.useState([]),
    _useState10 = _slicedToArray(_useState1, 2),
    recentSearches = _useState10[0],
    setRecentSearches = _useState10[1];
  // UI state
  var _useState11 = React.useState('overview'),
    _useState12 = _slicedToArray(_useState11, 2),
    activeView = _useState12[0],
    setActiveView = _useState12[1];
  var _useState13 = React.useState(null),
    _useState14 = _slicedToArray(_useState13, 2);
    _useState14[0];
    var setSelectedPlaylist = _useState14[1];
  var _useState15 = React.useState(true),
    _useState16 = _slicedToArray(_useState15, 2),
    isLoading = _useState16[0],
    setIsLoading = _useState16[1];
  // Check if we're in Electron
  var isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  // Load data
  React.useEffect(function () {
    var loadData = /*#__PURE__*/function () {
      var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
        var _yield$window$electro, loadedPlaylists, dir, recent, webPlaylists, _t;
        return _regenerator().w(function (_context) {
          while (1) switch (_context.p = _context.n) {
            case 0:
              setIsLoading(true);
              if (!isElectron) {
                _context.n = 6;
                break;
              }
              _context.p = 1;
              _context.n = 2;
              return window.electronAPI.getPlaylists();
            case 2:
              _yield$window$electro = _context.v;
              loadedPlaylists = _yield$window$electro.playlists;
              dir = _yield$window$electro.playlistsDirectory;
              setPlaylists(loadedPlaylists || {});
              setPlaylistsDirectory(dir || '');
              localSearchService.indexVideos(loadedPlaylists || {});
              _context.n = 3;
              return window.electronAPI.getRecentSearches();
            case 3:
              recent = _context.v;
              setRecentSearches(recent || []);
              _context.n = 5;
              break;
            case 4:
              _context.p = 4;
              _t = _context.v;
              console.error('Failed to load data:', _t);
            case 5:
              _context.n = 7;
              break;
            case 6:
              // Web fallback
              webPlaylists = window.__PLAYLISTS__ || {};
              setPlaylists(webPlaylists);
              localSearchService.indexVideos(webPlaylists);
            case 7:
              setIsLoading(false);
            case 8:
              return _context.a(2);
          }
        }, _callee, null, [[1, 4]]);
      }));
      return function loadData() {
        return _ref2.apply(this, arguments);
      };
    }();
    loadData();
  }, [isElectron]);
  // Computed stats
  var stats = React.useMemo(function () {
    var playlistStats = Object.entries(playlists).map(function (_ref3) {
      var _ref4 = _slicedToArray(_ref3, 2),
        name = _ref4[0],
        videos = _ref4[1];
      return {
        name: name,
        videoCount: videos.length,
        totalSize: videos.reduce(function (sum, v) {
          return sum + (v.size || 0);
        }, 0)
      };
    });
    var totalVideos = playlistStats.reduce(function (sum, p) {
      return sum + p.videoCount;
    }, 0);
    var totalSize = playlistStats.reduce(function (sum, p) {
      return sum + p.totalSize;
    }, 0);
    return {
      playlistCount: playlistStats.length,
      totalVideos: totalVideos,
      totalSize: totalSize,
      playlistStats: playlistStats
    };
  }, [playlists]);
  // Search handler
  var handleSearch = React.useCallback(/*#__PURE__*/function () {
    var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(query) {
      var results;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            setSearchQuery(query);
            if (query.trim()) {
              _context2.n = 1;
              break;
            }
            setSearchResults([]);
            return _context2.a(2);
          case 1:
            setIsSearching(true);
            _context2.n = 2;
            return new Promise(function (resolve) {
              return setTimeout(resolve, 150);
            });
          case 2:
            results = localSearchService.search(query, {
              limit: 100
            });
            setSearchResults(results);
            setIsSearching(false);
          case 3:
            return _context2.a(2);
        }
      }, _callee2);
    }));
    return function (_x) {
      return _ref5.apply(this, arguments);
    };
  }(), []);
  var handleClearSearch = React.useCallback(function () {
    setSearchQuery('');
    setSearchResults([]);
  }, []);
  // Add to priority queue via Supabase command
  var handleAddToPriorityQueue = React.useCallback(/*#__PURE__*/function () {
    var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(video) {
      var queueItem, supabase, result;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.n) {
          case 0:
            console.log('Admin: Add to priority queue', video);
            // Convert Video to QueueVideoItem format
            queueItem = {
              id: video.id,
              src: video.src || video.path || '',
              title: video.title,
              artist: video.artist || null,
              path: video.path || '',
              sourceType: 'local',
              playlist: video.playlist,
              playlistDisplayName: video.playlist,
              duration: video.duration
            }; // Send command via Supabase
            supabase = SupabaseService.getInstance();
            _context3.n = 1;
            return supabase.sendCommand(DEFAULT_PLAYER_ID, 'queue_add', {
              video: queueItem,
              queueType: 'priority'
            });
          case 1:
            result = _context3.v;
            if (result.success) {
              console.log('Admin: Priority queue add command sent:', result.commandId);
            } else {
              console.error('Admin: Failed to send priority queue command:', result.error);
            }
          case 2:
            return _context3.a(2);
        }
      }, _callee3);
    }));
    return function (_x2) {
      return _ref6.apply(this, arguments);
    };
  }(), []);
  // Directory selection
  var handleSelectDirectory = React.useCallback(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4() {
    var result, _yield$window$electro2, newPlaylists, _t2;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.p = _context4.n) {
        case 0:
          if (isElectron) {
            _context4.n = 1;
            break;
          }
          return _context4.a(2);
        case 1:
          _context4.p = 1;
          _context4.n = 2;
          return window.electronAPI.selectDirectory();
        case 2:
          result = _context4.v;
          if (!result.success) {
            _context4.n = 4;
            break;
          }
          setPlaylistsDirectory(result.path);
          // Reload playlists
          _context4.n = 3;
          return window.electronAPI.getPlaylists();
        case 3:
          _yield$window$electro2 = _context4.v;
          newPlaylists = _yield$window$electro2.playlists;
          setPlaylists(newPlaylists || {});
          localSearchService.indexVideos(newPlaylists || {});
        case 4:
          _context4.n = 6;
          break;
        case 5:
          _context4.p = 5;
          _t2 = _context4.v;
          console.error('Failed to select directory:', _t2);
        case 6:
          return _context4.a(2);
      }
    }, _callee4, null, [[1, 5]]);
  })), [isElectron]);
  // Format file size
  var formatSize = function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  if (isLoading) {
    return /*#__PURE__*/React.createElement("div", {
      className: "admin-console h-screen bg-gray-900 flex items-center justify-center ".concat(className)
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
    }), /*#__PURE__*/React.createElement("p", {
      className: "text-gray-400"
    }, "Loading admin console...")));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "admin-console h-screen bg-gray-900 flex flex-col ".concat(className)
  }, /*#__PURE__*/React.createElement("header", {
    className: "flex-shrink-0 px-6 py-4 bg-gray-800 border-b border-gray-700"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-bold text-white"
  }, "DJAMMS Admin Console"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-400 mt-1"
  }, playlistsDirectory || 'No playlists directory configured')), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: handleSelectDirectory,
    className: "px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
  }, "Change Directory"))), /*#__PURE__*/React.createElement("nav", {
    className: "flex gap-1 mt-4"
  }, [{
    id: 'overview',
    label: 'Overview',
    icon: '📊'
  }, {
    id: 'browse',
    label: 'Browse',
    icon: '📁'
  }, {
    id: 'search',
    label: 'Search',
    icon: '🔍'
  }, {
    id: 'settings',
    label: 'Settings',
    icon: '⚙️'
  }].map(function (item) {
    return /*#__PURE__*/React.createElement("button", {
      key: item.id,
      type: "button",
      onClick: function onClick() {
        return setActiveView(item.id);
      },
      className: "px-4 py-2 rounded-lg text-sm font-medium transition-colors ".concat(activeView === item.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/50')
    }, /*#__PURE__*/React.createElement("span", {
      className: "mr-2"
    }, item.icon), item.label);
  }))), /*#__PURE__*/React.createElement("main", {
    className: "flex-1 overflow-hidden"
  }, activeView === 'overview' && (/*#__PURE__*/React.createElement("div", {
    className: "h-full overflow-y-auto p-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-gray-800 rounded-xl p-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-2xl"
  }, "\uD83D\uDCCB")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-400"
  }, "Playlists"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-white"
  }, stats.playlistCount)))), /*#__PURE__*/React.createElement("div", {
    className: "bg-gray-800 rounded-xl p-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-green-600/20 rounded-xl flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-2xl"
  }, "\uD83C\uDFAC")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-400"
  }, "Total Videos"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-white"
  }, stats.totalVideos)))), /*#__PURE__*/React.createElement("div", {
    className: "bg-gray-800 rounded-xl p-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-2xl"
  }, "\uD83D\uDCBE")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-400"
  }, "Total Size"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-white"
  }, formatSize(stats.totalSize)))))), /*#__PURE__*/React.createElement("div", {
    className: "bg-gray-800 rounded-xl overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-6 py-4 border-b border-gray-700"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-lg font-semibold text-white"
  }, "Playlists")), /*#__PURE__*/React.createElement("div", {
    className: "divide-y divide-gray-700"
  }, stats.playlistStats.map(function (playlist) {
    return /*#__PURE__*/React.createElement("div", {
      key: playlist.name,
      className: "px-6 py-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors cursor-pointer",
      onClick: function onClick() {
        setSelectedPlaylist(playlist.name);
        setActiveView('browse');
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-xl"
    }, "\uD83C\uDFB5")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      className: "font-medium text-white"
    }, playlist.name), /*#__PURE__*/React.createElement("p", {
      className: "text-sm text-gray-400"
    }, playlist.videoCount, " videos \u2022 ", formatSize(playlist.totalSize)))), /*#__PURE__*/React.createElement("svg", {
      className: "w-5 h-5 text-gray-500",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24"
    }, /*#__PURE__*/React.createElement("path", {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2,
      d: "M9 5l7 7-7 7"
    })));
  }))))), activeView === 'browse' && (/*#__PURE__*/React.createElement(BrowseView, {
    playlists: playlists,
    onPlayVideo: function onPlayVideo(video) {
      console.log('Admin: Play video', video);
      // Could open in main player window via IPC
    },
    onAddToQueue: function onAddToQueue(video) {
      console.log('Admin: Add to queue', video);
    },
    onAddToPriorityQueue: handleAddToPriorityQueue,
    onPlayPlaylist: function onPlayPlaylist(name, videos) {
      console.log('Admin: Play playlist', name, videos.length);
    },
    className: "h-full"
  })), activeView === 'search' && (/*#__PURE__*/React.createElement("div", {
    className: "h-full flex flex-col p-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-2xl mx-auto w-full mb-6"
  }, /*#__PURE__*/React.createElement(SearchBar, {
    onSearch: handleSearch,
    onClear: handleClearSearch,
    placeholder: "Search all videos...",
    recentSearches: recentSearches,
    onRecentSearchClick: handleSearch,
    isSearching: isSearching,
    autoFocus: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-4xl mx-auto"
  }, /*#__PURE__*/React.createElement(SearchResults, {
    results: searchResults,
    query: searchQuery,
    isLoading: isSearching,
    onPlayVideo: function onPlayVideo(video) {
      console.log('Admin: Play video', video);
    },
    onAddToQueue: function onAddToQueue(video) {
      console.log('Admin: Add to queue', video);
    },
    onAddToPriorityQueue: handleAddToPriorityQueue
  }))))), activeView === 'settings' && (/*#__PURE__*/React.createElement("div", {
    className: "h-full overflow-y-auto p-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-2xl mx-auto"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-semibold text-white mb-6"
  }, "Settings"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-gray-800 rounded-xl p-6"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-medium text-white mb-2"
  }, "Playlists Directory"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-400 mb-4"
  }, "Location where DJAMMS looks for video playlists"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: playlistsDirectory,
    readOnly: true,
    className: "flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: handleSelectDirectory,
    className: "px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
  }, "Browse"))), /*#__PURE__*/React.createElement("div", {
    className: "bg-gray-800 rounded-xl p-6"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-medium text-white mb-2"
  }, "Recent Searches"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-400 mb-4"
  }, "Your recent search history"), recentSearches.length > 0 ? (/*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, recentSearches.map(function (search, index) {
    return /*#__PURE__*/React.createElement("span", {
      key: index,
      className: "px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-300"
    }, search);
  }))) : (/*#__PURE__*/React.createElement("p", {
    className: "text-gray-500 text-sm"
  }, "No recent searches")), recentSearches.length > 0 && (/*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: function () {
      var _onClick = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5() {
        return _regenerator().w(function (_context5) {
          while (1) switch (_context5.n) {
            case 0:
              if (!isElectron) {
                _context5.n = 2;
                break;
              }
              _context5.n = 1;
              return window.electronAPI.clearRecentSearches();
            case 1:
              setRecentSearches([]);
            case 2:
              return _context5.a(2);
          }
        }, _callee5);
      }));
      function onClick() {
        return _onClick.apply(this, arguments);
      }
      return onClick;
    }(),
    className: "mt-4 text-sm text-red-400 hover:text-red-300 transition-colors"
  }, "Clear search history"))), /*#__PURE__*/React.createElement("div", {
    className: "bg-gray-800 rounded-xl p-6"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-medium text-white mb-2"
  }, "About DJAMMS"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-400"
  }, "DJAMMS Player React Component v1.0.0"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-500 mt-2"
  }, "A crossfading video player built with React and Electron"))))))));
};

exports.AdminConsole = AdminConsole;
exports.BrowseView = BrowseView;
exports.DJAMMSPlayer = DJAMMSPlayer;
exports.FullscreenPlayer = FullscreenPlayer;
exports.Header = Header;
exports.LocalSearchService = LocalSearchService;
exports.NowPlayingPanel = NowPlayingPanel;
exports.PlayerWindow = PlayerWindow;
exports.PlaylistTab = PlaylistTab;
exports.QueueService = QueueService;
exports.QueueTab = QueueTab;
exports.SearchBar = SearchBar;
exports.SearchResults = SearchResults;
exports.SettingsTab = SettingsTab;
exports.Sidebar = Sidebar;
exports.SupabaseService = SupabaseService;
exports.TabNavigation = TabNavigation;
exports.ToolsTab = ToolsTab;
exports.VideoPlayer = VideoPlayer;
exports.YouTubeSearchService = YouTubeSearchService;
exports.getQueueService = getQueueService;
exports.getSupabaseService = getSupabaseService;
exports.localSearchService = localSearchService;
exports.useKeyboardControls = useKeyboardControls;
exports.useQueueManager = useQueueManager;
exports.useSkip = useSkip;
exports.useVideoPlayer = useVideoPlayer;
exports.youtubeSearchService = youtubeSearchService;
//# sourceMappingURL=main.mjs.map
