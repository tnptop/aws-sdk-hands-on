'use strict'

var AWS = require('aws-sdk')
var _async = require('async')
var ec2

function Network (region) {
  AWS.config.apiVersions = {
    ec2: '2015-10-01'
  }
  AWS.config.update({region: region})
  ec2 = new AWS.EC2()
}

// params: { CidrBlock }
Network.prototype.test = function (params) {
  _async.waterfall([
    function (callback) {
      ec2.createVpc({ CidrBlock: params.CidrBlock }, function (err, data) {
        if (err) callback(err, null)
        else {
          callback(null, {
            CidrBlock: data.Vpc.CidrBlock,
            VpcId: data.Vpc.VpcId
          })
        }
      })
    },
    function (params, callback) {
      console.log(params)
      var filter = [{ Name: 'vpc-id', Values: [ params.VpcId ] }]
      _async.parallel([
        function (callback) {
          ec2.describeNetworkInterfaces({ Filters: filter }, function (err, data) {
            if (err) callback(err, null)
            else callback(null, data)
          })
        },
        function (callback) {
          ec2.describeRouteTables({ Filters: filter }, function (err, data) {
            if (err) callback(err, null)
            else callback(null, data.RouteTables[0].RouteTableId)
          })
        }
      ], function (err, results) {
        if (err) callback(err, null)
        else callback(null, results)
      })
    }
  ], function (err, results) {
    if (err) console.log(err)
    else console.log(results)
  })
}

// params: { CidrBlock }
// return: { CidrBlock, VpcId }
Network.stepOne = function (params, callback) {
  _async.parallel([
    function (callback) {
      ec2.createVpc({ CidrBlock: params.CidrBlock }, function (err, data) {
        if (err) console.log('createVpc')
        if (err) callback(err, null)
        else {
          callback(null, {
            CidrBlock: data.Vpc.CidrBlock,
            VpcId: data.Vpc.VpcId
          })
        }
      })
    },
    function (callback) {
      ec2.createInternetGateway(function (err, data) {
        if (err) console.log('createInternetGateway')
        if (err) callback(err, null)
        else callback(null, data.InternetGateway.InternetGatewayId)
      })
    }
  ], function (err, results) {
    if (err) callback(err, null)
    else {
      callback(null, {
        CidrBlock: results[0].CidrBlock,
        VpcId: results[0].VpcId,
        InternetGatewayId: results[1]
      })
    }
  })
}

// params: { CidrBlock, VpcId, InternetGatewayId }
// return: { VpcId, SubnetId, SecurityGroupId, InternetGatewayId, RouteTableId }
Network.stepTwo = function (params, callback) {
  _async.parallel([
    function (callback) {
      ec2.createSubnet({
        CidrBlock: params.CidrBlock,
        VpcId: params.VpcId
      }, function (err, data) {
        if (err) console.log('createSubnet')
        if (err) callback(err, null)
        else callback(null, data.Subnet.SubnetId)
      })
    },
    function (callback) {
      ec2.createSecurityGroup({
        Description: 'Security group for datana',
        GroupName: 'datana-' + new Date().getTime(),
        VpcId: params.VpcId
      }, function (err, data) {
        if (err) console.log('createSecurityGroup')
        if (err) callback(err, null)
        else callback(null, data.GroupId)
      })
    },
    function (callback) {
      ec2.describeRouteTables({
        Filters: [{
          Name: 'vpc-id',
          Values: [ params.VpcId ]
        }]
      }, function (err, data) {
        if (err) console.log('createRouteTable')
        if (err) callback(err, null)
        else callback(null, data.RouteTables[0].RouteTableId)
      })
    },
    function (callback) {
      ec2.attachInternetGateway({
        InternetGatewayId: params.InternetGatewayId,
        VpcId: params.VpcId
      }, function (err, data) {
        if (err) console.log('attachInternetGateway')
        if (err) callback(err, null)
        else callback(null, data)
      })
    }
  ], function (err, results) {
    if (err) callback(err, null)
    else {
      callback(null, {
        VpcId: params.VpcId,
        SubnetId: results[0],
        SecurityGroupId: results[1],
        InternetGatewayId: params.InternetGatewayId,
        RouteTableId: results[2]
      })
    }
  })
}

// params: { VpcId, SubnetId, SecurityGroupId, InternetGatewayId, RouteTableId }
// return: { PublicIp, AllocationId, SecurityGroupId, NetworkInterfaceId }
Network.stepThree = function (params, callback) {
  _async.parallel([
    function (callback) {
      ec2.createRoute({
        DestinationCidrBlock: '0.0.0.0/0',
        RouteTableId: params.RouteTableId,
        GatewayId: params.InternetGatewayId
      }, function (err, data) {
        if (err) console.log('createRoute')
        if (err) callback(err, null)
        else callback(null, data.Return)
      })
    },
    function (callback) {
      ec2.associateRouteTable({
        RouteTableId: params.RouteTableId,
        SubnetId: params.SubnetId
      }, function (err, data) {
        if (err) console.log('associateRouteTable')
        if (err) callback(err, null)
        else callback(err, data.AssociationId)
      })
    },
    function (callback) {
      ec2.allocateAddress({ Domain: 'vpc' }, function (err, data) {
        if (err) console.log('allocateAddress')
        if (err) callback(err, null)
        else {
          callback(null, {
            PublicIp: data.PublicIp,
            AllocationId: data.AllocationId
          })
        }
      })
    },
    function (callback) {
      ec2.createNetworkInterface({
        SubnetId: params.SubnetId,
        Groups: [ params.SecurityGroupId ]
      }, function (err, data) {
        if (err) console.log('createNetworkInterface')
        if (err) callback(err, null)
        else callback(null, data.NetworkInterface.NetworkInterfaceId)
      })
    }
  ], function (err, results) {
    if (err) callback(err, null)
    else {
      callback(null, {
        PublicIp: results[2].PublicIp,
        AllocationId: results[2].AllocationId,
        SecurityGroupId: params.SecurityGroupId,
        NetworkInterfaceId: results[3]
      })
    }
  })
}

// params: { PublicIp, AllocationId, SecurityGroupId, NetworkInterfaceId }
// return: { SecurityGroupId, NetworkInterfaceId }
Network.stepFour = function (params, callback) {
  _async.parallel([
    function (callback) {
      ec2.authorizeSecurityGroupIngress({
        GroupId: params.SecurityGroupId,
        IpPermissions: [{
          IpProtocol: 'tcp',
          FromPort: 80,
          ToPort: 80,
          IpRanges: [{ CidrIp: '0.0.0.0/0' }]
        }, {
          IpProtocol: 'tcp',
          FromPort: 22,
          ToPort: 22,
          IpRanges: [{ CidrIp: '0.0.0.0/0' }]
        }, {
          IpProtocol: 'tcp',
          FromPort: 443,
          ToPort: 443,
          IpRanges: [{ CidrIp: '0.0.0.0/0' }]
        }]
      }, function (err, data) {
        if (err) console.log('authorizeSecurityGroupIngress')
        if (err) callback(err, null)
        else callback(null, data)
      })
    },
    function (callback) {
      ec2.associateAddress({
        AllocationId: params.AllocationId,
        NetworkInterfaceId: params.NetworkInterfaceId
      }, function (err, data) {
        if (err) console.log('associateAddress')
        if (err) callback(err, null)
        else callback(null, data.AssociationId)
      })
    }
  ], function (err, results) {
    if (err) callback(err, null)
    else {
      callback(null, {
        PublicIp: params.PublicIp,
        SecurityGroupId: params.SecurityGroupId,
        NetworkInterfaceId: params.NetworkInterfaceId
      })
    }
  })
}

Network.prototype.initNetwork = function (params) {
  _async.waterfall([
    _async.apply(Network.stepOne, params),
    Network.stepTwo,
    Network.stepThree,
    Network.stepFour
  ], function (err, result) {
    if (err) {
      console.log(err)
      return err
    } else {
      console.log(result)
      return result
    }
  })
}

module.exports = Network