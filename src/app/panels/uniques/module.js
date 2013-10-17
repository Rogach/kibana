/*

  ## Hits

  ### Parameters
  * style :: A hash of css styles
  * arrangement :: How should I arrange the query results? 'horizontal' or 'vertical'
  * chart :: Show a chart? 'none', 'bar', 'pie'
  * donut :: Only applies to 'pie' charts. Punches a hole in the chart for some reason
  * tilt :: Only 'pie' charts. Janky 3D effect. Looks terrible 90% of the time.
  * lables :: Only 'pie' charts. Labels on the pie?

*/
define([
  'angular',
  'app',
  'underscore',
  'jquery',
  'kbn',

  'jquery.flot',
  'jquery.flot.pie'
], function (angular, app, _, $, kbn) {
  'use strict';

  var module = angular.module('kibana.panels.uniques', []);
  app.useModule(module);

  module.controller('uniques', function($scope, querySrv, dashboard, filterSrv, $q) {
    $scope.panelMeta = {
      modals : [
        {
          description: "Inspect",
          icon: "icon-info-sign",
          partial: "app/partials/inspector.html",
          show: $scope.panel.spyable
        }
      ],
      editorTabs : [
        {title:'Queries', src:'app/partials/querySelect.html'}
      ],
      status  : "Beta",
      description :
        "Count unique records returned by query. " +
        "Uniqueness is determined by examining set of fields. " +
        "Can be a pie chart, bar chart, or list"
    };

    // Set and populate defaults
    var _d = {
      queries     : {
        mode        : 'all',
        ids         : []
      },
      style   : { "font-size": '10pt'},
      arrangement : 'horizontal',
      chart       : 'bar',
      counter_pos : 'above',
      donut   : false,
      tilt    : false,
      labels  : true,
      spyable : true
    };
    _.defaults($scope.panel,_d);

    $scope.init = function () {

      $scope.$on('refresh',function(){
        $scope.get_data();
      });
      $scope.get_data();

    };

    $scope.get_data = function() {
      delete $scope.panel.error;
      $scope.panelMeta.loading = true;

      // Make sure we have everything for the request to complete
      if(dashboard.indices.length === 0) {
        return;
      }

      $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);
      var resultSets = _.map($scope.panel.queries.ids, function(queryId, i) {
        var request = $scope.ejs.Request()
          .indices(dashboard.indices)
          .query(
            $scope.ejs.FilteredQuery(
              $scope.ejs.BoolQuery().should(querySrv.getEjsObj(queryId)),
              filterSrv.getBoolFilter(filterSrv.ids)
            )
          )
          .size(100000);
        if (i === 0) {
          // Since I don't know how to combine several queries into one,
          // we'll only add first query to inpector
          $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);
        }
        return request.doSearch();
      });

      var getFingerprint = function(v) {
        if (_.isUndefined($scope.panel.fingerprintFields)) {
          return v._source;
        } else {
          return _($scope.panel.fingerprintFields).map(function(f){
            return v._source[f];
          });
        }
      };

      $q.all(resultSets).then(function(resultSets){
        $scope.panelMeta.loading = false;
        $scope.data = _(_.zip($scope.panel.queries.ids, resultSets)).map(function(dt,i){
          var queryId = dt[0];
          var result = dt[1];
          var uniqueSet = {};
          _(result.hits.hits).each(function(v){
            uniqueSet[getFingerprint(v)] = 1;
          });
          var uniqueCount = Object.keys(uniqueSet).length;
          return {
            info: querySrv.list[queryId],
            id: queryId,
            hits: uniqueCount,
            data: [[i, uniqueCount]]
          };
        });
        $scope.$emit('render');
      });

    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
    };

    $scope.close_edit = function() {
      if($scope.refresh) {
        $scope.get_data();
      }
      $scope.refresh =  false;
      $scope.$emit('render');
    };
  });


  module.directive('hitsChart', function(querySrv) {
    return {
      restrict: 'A',
      link: function(scope, elem) {

        // Receive render events
        scope.$on('render',function(){
          render_panel();
        });

        // Re-render if the window is resized
        angular.element(window).bind('resize', function(){
          render_panel();
        });

        // Function for rendering panel
        function render_panel() {
          // IE doesn't work without this
          elem.css({height:scope.panel.height||scope.row.height});

          try {
            _.each(scope.data,function(series) {
              series.label = series.info.alias;
              series.color = series.info.color;
            });
          } catch(e) {return;}

          // Populate element
          try {
            // Add plot to scope so we can build out own legend
            if(scope.panel.chart === 'bar') {
              scope.plot = $.plot(elem, scope.data, {
                legend: { show: false },
                series: {
                  lines:  { show: false, },
                  bars:   { show: true,  fill: 1, barWidth: 0.8, horizontal: false },
                  shadowSize: 1
                },
                yaxis: { show: true, min: 0, color: "#c8c8c8" },
                xaxis: { show: false },
                grid: {
                  borderWidth: 0,
                  borderColor: '#eee',
                  color: "#eee",
                  hoverable: true,
                },
                colors: querySrv.colors
              });
            }
            if(scope.panel.chart === 'pie') {
              scope.plot = $.plot(elem, scope.data, {
                legend: { show: false },
                series: {
                  pie: {
                    innerRadius: scope.panel.donut ? 0.4 : 0,
                    tilt: scope.panel.tilt ? 0.45 : 1,
                    radius: 1,
                    show: true,
                    combine: {
                      color: '#999',
                      label: 'The Rest'
                    },
                    stroke: {
                      width: 0
                    },
                    label: {
                      show: scope.panel.labels,
                      radius: 2/3,
                      formatter: function(label, series){
                        return '<div ng-click="build_search(panel.query.field,\''+label+'\')'+
                          ' "style="font-size:8pt;text-align:center;padding:2px;color:white;">'+
                          label+'<br/>'+Math.round(series.percent)+'%</div>';
                      },
                      threshold: 0.1
                    }
                  }
                },
                //grid: { hoverable: true, clickable: true },
                grid:   { hoverable: true, clickable: true },
                colors: querySrv.colors
              });
            }
          } catch(e) {
            elem.text(e);
          }
        }

        var $tooltip = $('<div>');
        elem.bind("plothover", function (event, pos, item) {
          if (item) {
            var value = scope.panel.chart === 'bar' ?
              item.datapoint[1] : item.datapoint[1][0][1];
            $tooltip
              .html(kbn.query_color_dot(item.series.color, 20) + ' ' + value.toFixed(0))
              .place_tt(pos.pageX, pos.pageY);
          } else {
            $tooltip.remove();
          }
        });

      }
    };
  });
});
