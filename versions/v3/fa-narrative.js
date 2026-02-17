// ForkArcade Engine v1 — Narrative (multi-graph)
// ENGINE FILE — do not modify in game repos
(function(window) {
  'use strict';

  var FA = window.FA;

  FA.narrative = {
    variables: {},
    graphs: {},
    _events: [],

    init: function(config) {
      this.variables = config.variables || {};
      this.graphs = {};
      this._events = [];
      var gs = config.graphs || {};
      for (var id in gs) {
        this.graphs[id] = {
          currentNode: gs[id].startNode || null,
          nodes: gs[id].nodes || [],
          edges: gs[id].edges || []
        };
      }
      this._sync();
    },

    transition: function(graphId, nodeId, event) {
      var g = this.graphs[graphId];
      if (!g) { console.warn('[FA.narrative] Unknown graph: ' + graphId); return; }
      if (g.edges && g.edges.length > 0 && g.currentNode) {
        var valid = false;
        for (var i = 0; i < g.edges.length; i++) {
          if (g.edges[i].from === g.currentNode && g.edges[i].to === nodeId) {
            valid = true; break;
          }
        }
        if (!valid) {
          console.warn('[FA.narrative] No edge from "' + g.currentNode + '" to "' + nodeId + '" in graph "' + graphId + '"');
        }
      }
      var prev = g.currentNode;
      g.currentNode = nodeId;
      if (event) {
        this._events.push(event);
        if (this._events.length > 20) this._events.shift();
      }
      this._sync();
      FA.emit('narrative:transition', { graph: graphId, from: prev, to: nodeId, event: event });
    },

    setVar: function(name, value, reason) {
      var prev = this.variables[name];
      this.variables[name] = value;
      var evt = reason || (name + ' = ' + value);
      this._events.push(evt);
      if (this._events.length > 20) this._events.shift();
      this._sync();
      FA.emit('narrative:varChanged', { name: name, value: value, prev: prev, reason: reason });
      this._evaluate();
    },

    getVar: function(name) {
      return this.variables[name];
    },

    getNode: function(graphId) {
      var g = this.graphs[graphId];
      if (!g || !g.nodes) return null;
      for (var i = 0; i < g.nodes.length; i++) {
        if (g.nodes[i].id === g.currentNode) return g.nodes[i];
      }
      return null;
    },

    getEvents: function() {
      return this._events;
    },

    _evaluate: function() {
      for (var gId in this.graphs) {
        var g = this.graphs[gId];
        if (!g.edges) continue;
        for (var i = 0; i < g.edges.length; i++) {
          var e = g.edges[i];
          if (e.from !== g.currentNode) continue;
          if (e.var === undefined) continue;
          var val = this.variables[e.var];
          var match = true;
          if (e.eq !== undefined && val !== e.eq) match = false;
          if (e.gte !== undefined && !(val >= e.gte)) match = false;
          if (e.lte !== undefined && !(val <= e.lte)) match = false;
          if (match) {
            this.transition(gId, e.to, e.var + ' \u2192 ' + e.to);
            return;
          }
        }
      }
    },

    _sync: function() {
      if (typeof ForkArcade !== 'undefined') {
        ForkArcade.updateNarrative({
          variables: this.variables,
          graphs: this.graphs,
          event: this._events.length > 0 ? this._events[this._events.length - 1] : null
        });
      }
    }
  };

  // Content selection: first matching entry wins
  FA.select = function(entries) {
    if (!entries) return null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.node) {
        var p = e.node.indexOf(':');
        var gId = e.node.substring(0, p);
        var nId = e.node.substring(p + 1);
        var node = FA.narrative.getNode(gId);
        if (node && node.id === nId) return e;
      } else if (e.var !== undefined) {
        var val = FA.narrative.getVar(e.var);
        var match = true;
        if (e.eq !== undefined && val !== e.eq) match = false;
        if (e.gte !== undefined && !(val >= e.gte)) match = false;
        if (e.lte !== undefined && !(val <= e.lte)) match = false;
        if (match) return e;
      } else {
        return e; // no condition = fallback
      }
    }
    return null;
  };

})(window);
