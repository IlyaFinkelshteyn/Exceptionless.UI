(function () {
  'use strict';

  angular.module('app.organization')
    .controller('organization.List', ['$ExceptionlessClient', '$rootScope', '$scope', '$window', '$state', 'billingService', 'dialogs', 'dialogService', 'filterService', 'linkService', 'notificationService', 'organizationService', 'paginationService', 'STRIPE_PUBLISHABLE_KEY', function ($ExceptionlessClient, $rootScope, $scope, $window, $state, billingService, dialogs, dialogService, filterService, linkService, notificationService, organizationService, paginationService, STRIPE_PUBLISHABLE_KEY) {
      var source = 'exceptionless.organization.List';
      var settings = { mode: 'stats' };
      var vm = this;

      function add() {
        return dialogs.create('app/organization/list/add-organization-dialog.tpl.html', 'AddOrganizationDialog as vm').result.then(createOrganization);
      }

      function canChangePlan() {
        return !!STRIPE_PUBLISHABLE_KEY && vm.organizations && vm.organizations.length > 0;
      }

      function changePlan(organizationId) {
        if (!STRIPE_PUBLISHABLE_KEY) {
          notificationService.error('Billing is currently disabled.');
          return;
        }

        return billingService.changePlan(organizationId);
      }

      function createOrganization(name) {
        function onSuccess(response) {
          vm.organizations.push(response.data.plain());
        }

        function onFailure(response) {
          if (response.status === 426) {
            return billingService.confirmUpgradePlan(response.data.message).then(function () {
              return createOrganization(name);
            });
          }

          var message = 'An error occurred while creating the organization.';
          if (response.data && response.data.message) {
            message += ' Message: ' + response.data.message;
          }

          notificationService.error(message);
        }

        return organizationService.create(name).then(onSuccess, onFailure);

      }

      function get(options, useCache) {
        function onSuccess(response) {
          vm.organizations = response.data.plain();

          var links = linkService.getLinksQueryParameters(response.headers('link'));
          vm.previous = links['previous'];
          vm.next = links['next'];

          vm.pageSummary = paginationService.getCurrentPageSummary(response.data, vm.currentOptions.page, vm.currentOptions.limit);

          if (vm.organizations.length === 0 && vm.currentOptions.page && vm.currentOptions.page > 1) {
            return get(null, useCache);
          }

          return vm.organizations;
        }

        vm.loading = vm.organizations.length === 0;
        vm.currentOptions = options || settings;
        return organizationService.getAll(vm.currentOptions, useCache).then(onSuccess).finally(function() {
          vm.loading = false;
        });
      }

      function leave(organization, user) {
        return dialogService.confirmDanger('Are you sure you want to leave this organization?', 'LEAVE ORGANIZATION').then(function () {
          function onSuccess() {
            vm.organizations.splice(vm.organizations.indexOf(organization), 1);
          }

          function onFailure(response) {
            var message = 'An error occurred while trying to leave the organization.';
            if (response.status === 400) {
              message += ' Message: ' + response.data.message;
            }

            notificationService.error(message);
          }

          return organizationService.removeUser(organization.id, user.email_address).then(onSuccess, onFailure);
        });
      }

      function open(id, event) {
        var openInNewTab = (event.ctrlKey || event.metaKey || event.which === 2);
        $ExceptionlessClient.createFeatureUsage(source + '.open').setProperty('id', id).setProperty('_blank', openInNewTab).submit();
        if (openInNewTab) {
          $window.open($state.href('app.organization.manage', { id: id }, { absolute: true }), '_blank');
        } else {
          $state.go('app.organization.manage', { id: id });
        }

        event.preventDefault();
      }

      function nextPage() {
        $ExceptionlessClient.createFeatureUsage(source + '.nextPage').setProperty('next', vm.next).submit();
        return get(vm.next);
      }

      function previousPage() {
        $ExceptionlessClient.createFeatureUsage(source + '.previousPage').setProperty('previous', vm.previous).submit();
        return get(vm.previous);
      }

      function remove(organization) {
        $ExceptionlessClient.createFeatureUsage(source + '.remove').setProperty('organization', organization).submit();
        return dialogService.confirmDanger('Are you sure you want to delete this organization?', 'DELETE ORGANIZATION').then(function () {
          function onSuccess() {
            vm.organizations.splice(vm.organizations.indexOf(organization), 1);
            notificationService.info('Successfully queued the organization for deletion.');
            $ExceptionlessClient.createFeatureUsage(source + '.remove.success').setProperty('organization', organization).submit();
          }

          function onFailure(response) {
            var message = 'An error occurred while trying to delete the organization.';
            if (response.status === 400) {
              message += ' Message: ' + response.data.message;
            }

            $ExceptionlessClient.createFeatureUsage(source + '.remove.error').setProperty('organization', organization).submit();
            notificationService.error(message);
          }

          return organizationService.remove(organization.id).then(onSuccess, onFailure);
        });
      }

      vm.add = add;
      vm.canChangePlan = canChangePlan;
      vm.changePlan = changePlan;
      vm.get = get;
      vm.hasFilter = filterService.hasFilter;
      vm.leave = leave;
      vm.loading = true;
      vm.nextPage = nextPage;
      vm.open = open;
      vm.organizations = [];
      vm.previousPage = previousPage;
      vm.remove = remove;

      $ExceptionlessClient.submitFeatureUsage(source);
      get();
    }]);
}());
