angular.module('excuses', ['ngRoute','ngResource'])
  .controller('MainController', function($window,$scope,$route,$http,$location) {
    $scope.session = $window.sessionStorage;
    $http.get('api/checksession')
      .success(function() {
      })
      .error(function() {
        $scope.logout();
      });

    $scope.logout = function logout() {
      delete $window.sessionStorage.token;
      $location.path('login');
    }
    $scope.newUser = function newUser() {
      $location.path('users/new');
    }
  })

  .controller('SetAlarmController', function($resource,$scope,$http,$routeParams) {
    $http.get('api/user').success(function (data) {
      $scope.user = data.user;
    });
    $http.get('api/excuses').success(function (data) {
      $scope.excuses = data;
      $scope.excuse = 1;
    });
    updateAlarms();

    function updateAlarms() {
      $http.get('api/alarms').success(function (data) {
        $scope.alarms = data;
      });
    }

    $scope.setAlarm = function setAlarm() {
      $http.post('api/alarms', {
        time: new Date($scope.time).getTime(),
        excuse_id: $scope.excuse
      }).success(updateAlarms);
    };

    $scope.cancelAlarm = function cancelAlarm(id) {
      $http.delete('api/alarm/'+id).success(updateAlarms);
    };
  })

  .controller('LoginController', function($scope,$http,$window,$location) {
    $scope.login = function() {
      $http.post('/authenticate', {email:$scope.email, password:$scope.password})
        .success(function (data,status,headers,config) {
          $window.sessionStorage.token = data.token;
          $location.path('/user');
        })
        .error(function (data,status,headers,config) {
          delete $window.sessionStorage.token;
          alert(data);
          // alert("Error: Unknown email/password combination");
        });
    };
  })

  .controller('NewUserController', function($scope, $http, $location, $window) {
    $scope.newUser = function() {
      // console.log({
      //   name: $scope.name,
      //   phone: $scope.phone,
      //   email: $scope.email,
      //   password: $scope.password
      // });
      $http.post('/users', {
        name: $scope.name,
        phone: $scope.phone,
        email: $scope.email,
        password: $scope.password
      })
        .success(function() {
          $http.post('/authenticate', {email:$scope.email, password:$scope.password})
            .success(function (data,status,headers,config) {
              $window.sessionStorage.token = data.token;
              $location.path('/user');
            })
            .error(function (data,status,headers,config) {
              delete $window.sessionStorage.token;
              alert(data);
            });
        })
        .error(function(err) {
          alert(err);
        });
    }
  })

  .factory('authInterceptor', function($rootScope, $q, $window, $location) {
    return {
      request: function(config) {
        config.headers = config.headers || {};
        if ($window.sessionStorage.token) {
          config.headers.Authorization = 'Bearer ' + $window.sessionStorage.token;
        }
        return config;
      },
      response: function(response) {
        if (response.status === 401) {
          delete $window.sessionStorage.token;
          $location.path('login');
        }
        return response || $q.when(response);
      }
    };
  })

  .config(function($routeProvider, $httpProvider) {
    $httpProvider.interceptors.push('authInterceptor');
    $routeProvider
      .when('/login', {
        templateUrl: 'templates/login.html',
        controller: 'LoginController'
      })
      .when('/user', {
        templateUrl: 'templates/set-alarm.html',
        controller: 'SetAlarmController'
      })
      .when('/users/new', {
        templateUrl: 'templates/newuser.html',
        controller: 'NewUserController'
      });
    });