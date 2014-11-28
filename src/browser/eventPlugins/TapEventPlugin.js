/**
 * Copyright 2013-2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule TapEventPlugin
 * @typechecks static-only
 */

"use strict";

var EventConstants = require('EventConstants');
var EventPluginUtils = require('EventPluginUtils');
var EventPropagators = require('EventPropagators');
var SyntheticUIEvent = require('SyntheticUIEvent');
var TouchEventUtils = require('TouchEventUtils');
var ViewportMetrics = require('ViewportMetrics');

var keyOf = require('keyOf');
var topLevelTypes = EventConstants.topLevelTypes;

var isStartish = EventPluginUtils.isStartish;
var isEndish = EventPluginUtils.isEndish;

var isTouch = function(topLevelType) {
  var touchTypes = [
    topLevelTypes.topTouchCancel,
    topLevelTypes.topTouchEnd,
    topLevelTypes.topTouchStart,
    topLevelTypes.topTouchMove
  ];
  return touchTypes.indexOf(topLevelType) >= 0;
}

/**
 * Number of pixels that are tolerated in between a `touchStart` and `touchEnd`
 * in order to still be considered a 'tap' event.
 */
var tapMoveThreshold = 10;
var ignoreMouseThreshold = 750;
var tapDelay = 200; // Minimum time between tap events
var tapMaxTime = 600; // Max time between start and end of touch
var startCoords = {x: null, y: null};
var startTime = 0;
var lastTouchEvent = null;
var lastTapTime = 0;
var trackingTouchEvent = false;

var Axis = {
  x: {page: 'pageX', client: 'clientX', envScroll: 'currentPageScrollLeft'},
  y: {page: 'pageY', client: 'clientY', envScroll: 'currentPageScrollTop'}
};

function getAxisCoordOfEvent(axis, nativeEvent) {
  var singleTouch = TouchEventUtils.extractSingleTouch(nativeEvent);
  if (singleTouch) {
    return singleTouch[axis.page];
  }
  return axis.page in nativeEvent ?
    nativeEvent[axis.page] :
    nativeEvent[axis.client] + ViewportMetrics[axis.envScroll];
}

function getDistance(coords, nativeEvent) {
  var pageX = getAxisCoordOfEvent(Axis.x, nativeEvent);
  var pageY = getAxisCoordOfEvent(Axis.y, nativeEvent);
  return Math.pow(
    Math.pow(pageX - coords.x, 2) + Math.pow(pageY - coords.y, 2),
    0.5
  );
}

function touchWithinBoundaries(nativeEvent) {
  return getDistance(startCoords, nativeEvent) < tapMoveThreshold && 
           (nativeEvent.timeStamp - startTime) < tapMaxTime;
}

var dependencies = [
  topLevelTypes.topMouseDown,
  topLevelTypes.topMouseMove,
  topLevelTypes.topMouseUp
];

if (EventPluginUtils.useTouchEvents) {
  dependencies.push(
    topLevelTypes.topTouchCancel,
    topLevelTypes.topTouchEnd,
    topLevelTypes.topTouchStart,
    topLevelTypes.topTouchMove
  );
}

var eventTypes = {
  touchTap: {
    phasedRegistrationNames: {
      bubbled: keyOf({onTouchTap: null}),
      captured: keyOf({onTouchTapCapture: null})
    },
    dependencies: dependencies
  }
};

var TapEventPlugin = {

  tapMoveThreshold: tapMoveThreshold,

  ignoreMouseThreshold: ignoreMouseThreshold,

  eventTypes: eventTypes,

  /**
   * @param {string} topLevelType Record from `EventConstants`.
   * @param {DOMEventTarget} topLevelTarget The listening component root node.
   * @param {string} topLevelTargetID ID of `topLevelTarget`.
   * @param {object} nativeEvent Native browser event.
   * @return {*} An accumulation of synthetic events.
   * @see {EventPluginHub.extractEvents}
   */
  extractEvents: function(
      topLevelType,
      topLevelTarget,
      topLevelTargetID,
      nativeEvent) {
    
    if (nativeEvent.timeStamp == null)
      nativeEvent.timeStamp = +new Date();

    if (isTouch(topLevelType)) {
      lastTouchEvent = nativeEvent.timeStamp;
      if (nativeEvent.timeStamp - lastTapTime < tapDelay) // Skip 'phantom' clicks
        return null;
    } else {
      if (lastTouchEvent && (nativeEvent.timeStamp - lastTouchEvent) < ignoreMouseThreshold) {
        return null;
      }
    }

    var event = null;
    if (isStartish(topLevelType)) {
      startCoords.x = getAxisCoordOfEvent(Axis.x, nativeEvent);
      startCoords.y = getAxisCoordOfEvent(Axis.y, nativeEvent);
      startTime = nativeEvent.timeStamp;
      trackingTouchEvent = true;

    } else if (isEndish(topLevelType)) {
      if (trackingTouchEvent && touchWithinBoundaries(nativeEvent)) {
        event = SyntheticUIEvent.getPooled(
          eventTypes.touchTap,
          topLevelTargetID,
          nativeEvent
        );
        lastTapTime = nativeEvent.timeStamp;
      }

      startCoords.x = 0;
      startCoords.y = 0;
      trackingTouchEvent = false;

    } else { // Move-ish
      // Cancel tracking if we're outside the boundary.
      if (trackingTouchEvent && !touchWithinBoundaries(nativeEvent)) {
        trackingTouchEvent = false;
      }
    }

    EventPropagators.accumulateTwoPhaseDispatches(event);
    return event;
  }

};

module.exports = TapEventPlugin;
