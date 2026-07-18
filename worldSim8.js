var logging = 0;
var regions = [];
var numberOfRegions = 4;

function simLog() {
  if (logging) {
    console.log.apply(console, arguments);
  }
}

function syncLoggingSetting() {
  var loggingCheckbox = document.getElementById('enableLogging');
  logging = loggingCheckbox && loggingCheckbox.checked ? 2 : 0;
}

//https://stackoverflow.com/questions/1527803/generating-random-numbers-in-javascript-in-a-specific-range
//https://stackoverflow.com/users/58808/ionu%C8%9B-g-stan
function randrange(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

//http://rosettacode.org/wiki/Averages/Median#JavaScript
//return the median value of an array of numbers
function median(ary) {
  if (ary.length == 0) return null;
  ary.sort(function (a, b) {
    return a - b;
  });
  var mid = Math.floor(ary.length / 2);
  if (ary.length % 2 == 1) {
    // length is odd
    return ary[mid];
  } else {
    return (ary[mid - 1] + ary[mid]) / 2;
  }
}
/*
//https://stackoverflow.com/questions/1960473/unique-values-in-an-array
//https://stackoverflow.com/users/80720/rafael
Array.prototype.getUnique = function(){
   var u = {}, a = [];
   for(var i = 0, l = this.length; i < l; ++i){
      if(u.hasOwnProperty(this[i])) {
         continue;
      }
      a.push(this[i]);
      u[this[i]] = 1;
   }
   return a;
}*/

//https://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
//https://stackoverflow.com/users/109538/broofa
//not really a guid, but generates a b64'd epoch and concatenates a 16char random strings
function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  function makeGuid() {
    return (
      btoa(Date.now()).substr(0, 18) + '-' + s4() + s4() + '-' + s4() + s4()
    );
  }
  return makeGuid();
}

//https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript
//https://stackoverflow.com/users/353278/jeff
//+ Jonas Raoni Soares Silva
//@ http://jsfromhell.com/array/shuffle [v1.0]
//returns a randomly re-ordered array
function shuffle(o) {
  //v1.0
  for (
    var j, x, i = o.length;
    i;
    j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x
  );
  return o;
}

//I don't know why I made this... don't array's already have lengths? maybe arrays of objects don't? what? why?
function associativeArrayLen(inArray) {
  var arrayLen = 0;
  for (var x in inArray) {
    arrayLen++;
  }
  return arrayLen;
}

var gridXSize = 40;
var gridYSize = 40;
//define the agent class
function agent(object) {
  //TODO: Add internal metrics to agents. number of trades, total value of trades
  //define an init for agents
  //(function __init__(this){
  this.position = { x: randrange(1, gridXSize), y: randrange(1, gridYSize) };
  this.state = 0; //0 = waiting, 1 = moving;
  this.distToDest = 0; //Math.ceil();
  this.totalDistanceTraveled = 0;
  this.resources = [];
  this.resourcesIndex = [];
  this.minRecName = '';
  this.maxRecName = '';
  this.region = -1;
  this.plan = [];
  //could stand to make this a uuid or something
  this.agentID = guid(); //randrange(1,10000000);
  if (logging) {
    console.log(this.agentID);
  }
  //})();

  //define a means to create agent resources
  agent.prototype.addResource = function (resourceName) {
    var newResource = new resource();
    this.resourcesIndex.push(resourceName);
    newResource.name = resourceName;
    //this.resources.push(newResource);
    this.resources[resourceName] = newResource;
  };

  //TODO: Move these into resource as getValue and setValue
  //define a means to retrieve agent resource values
  agent.prototype.getResourceValue = function (resourceName, attribName) {
    return this.resources[resourceName][attribName];
  };

  //TODO: Move these into resource as getValue and setValue
  //define a means to set agent resource values
  agent.prototype.setResourceValue = function (
    resourceName,
    attribName,
    value,
  ) {
    this.maxRecName = '';
    this.minRecName = '';
    resourceName = resourceName.toString();
    attribName = attribName.toString();
    value = value; //.toString()
    for (resourceIndex in this.resources) {
      var resource = this.resources[resourceIndex];
      if (resource.name == resourceName) {
        //eval("resource." + attribName.toString() + " = " + value.toString());
        resource[attribName] = value;
        //return eval("resource." + attribName.toString());
        return resource[attribName];
      }
    }
  };

  //define a means to retrieve agent resource values
  agent.prototype.getMinValRecName = function () {
    var minValRec = 9999;
    var minValRecName = 'Lies';
    if (this.minRecName == '') {
      //for (resourceIndex in this.resources){
      //console.log('resourceIndex: '+resourceIndex);
      for (var i = 0; i < this.resourcesIndex.length; i++) {
        var resourceIndex = this.resourcesIndex[i];
        //console.log('resourceIndex: '+resourceIndex);
        var resource = this.resources[resourceIndex];
        if (resource.quantity < minValRec) {
          minValRecName = resourceIndex;
          minValRec = resource.quantity;
        } else if (resource.quantity == minValRec) {
          if (randrange(1, 100) < 50) {
            minValRecName = resourceIndex;
          }
        }
      }
    } else {
      return this.minRecName;
    }
    //set Cache
    this.minRecName = minValRecName;
    return minValRecName;

    //function resourceSort(a, b){
    //	return(a.quantity-b.quantity);
    //}
    //this.resources.sort(resourceSort);
    ////this doesn't work on associative arrays
    ////return this.resources[this.resourcesIndex[0]].name;
    //return this.resourcesIndex[0];
  };

  agent.prototype.getPlan = function (numberOfSteps) {
    //console.time('getPlanTimer');
    numberOfSteps = numberOfSteps || 1;
    //console.log('numberOfSteps:'+numberOfSteps.toString());
    //return false;
    var plan = [];
    var planEndNode = { aVal: 0 };
    function planStep(
      agent,
      parentStep,
      fd,
      ed,
      md,
      depth,
      maxDepth,
      pathSoFar,
    ) {
      //console.log('agent:'+agent+'; parentStep: '+parentStep+'; fd: '+fd+'; ed: '+ed+';md: '+md+';depth: '+depth+';maxDepth: '+maxDepth+';pathSoFar: '+pathSoFar);
      //return true;
      //this.parentNode = {};
      this.fVal = parentStep.fVal + fd;
      this.eVal = parentStep.eVal + ed;
      this.mVal = parentStep.mVal + md;

      //console.log("fVal: "+this.fVal+", eVal: "+this.eVal+", mVal: "+this.mVal);
      this.pathSoFar = pathSoFar; //planEndNode;
      //this.childNodes = [];

      if (depth == maxDepth) {
        //console.log('deep');
        var fLow = agent.getResourceValue('food', 'lowThreshold');
        var eLow = agent.getResourceValue('energy', 'lowThreshold');
        var mLow = agent.getResourceValue('money', 'lowThreshold');
        var fHigh = agent.getResourceValue('food', 'highThreshold');
        var eHigh = agent.getResourceValue('energy', 'highThreshold');
        var mHigh = agent.getResourceValue('money', 'highThreshold');

        //console.log("fLow: "+fLow+", eLow: "+eLow+", mLow: "+mLow+
        //		", fHigh: "+fHigh+", eHigh: "+eHigh+", mHigh: "+mHigh);

        this.valAvg = (this.fVal + this.eVal + this.mVal) / 3.0;

        //console.log("fHigh: "+fHigh);
        //console.log("(this.fVal-fHigh): "+(this.fVal-fHigh));
        //console.log("Math.abs(this.fVal-fHigh): "+Math.abs(fVal-fHigh));
        //console.log("((this.fVal-fHigh)+Math.abs(this.fVal-fHigh))/2: "+((this.fVal-fHigh)+Math.abs(this.fVal-fHigh))/2);
        //console.log("fBuff: "+fBuff);

        //console.log("this.fVal: "+this.fVal);
        //console.log("this.eVal: "+this.eVal);
        //console.log("this.mVal: "+this.mVal);
        //console.log("eHigh: "+eHigh);
        //console.log("fHigh: "+fHigh);
        //console.log("mHigh: "+mHigh);
        //console.log("eLow: "+eLow);
        //console.log("fLow: "+fLow);
        //console.log("mLow: "+mLow);

        //TODO: acct for prefs here agent.resources['bloop'].preference
        var fBuff = (this.fVal - fHigh + Math.abs(this.fVal - fHigh)) / 2;
        var eBuff = (this.eVal - eHigh + Math.abs(this.eVal - eHigh)) / 2;
        var mBuff = (this.mVal - mHigh + Math.abs(this.mVal - mHigh)) / 2;
        var fNerf = (fLow - this.fVal + Math.abs(fLow - this.fVal)) / 2;
        var eNerf = (eLow - this.eVal + Math.abs(eLow - this.eVal)) / 2;
        var mNerf = (mLow - this.mVal + Math.abs(mLow - this.mVal)) / 2;

        //console.log("fBuff: "+fBuff+", eBuff: "+eBuff+", mBuff: "+mBuff+
        //		", fNerf: "+fNerf+", eNerf: "+eNerf+", mNerf: "+mNerf);

        this.aVal =
          this.valAvg + (fBuff + eBuff + mBuff) - (fNerf + eNerf + mNerf);

        //console.log('this');
        //console.log(this);
        if (this.aVal > planEndNode.aVal && depth != 0) {
          planEndNode = this;
        } else if (
          this.aVal == planEndNode.aVal &&
          depth != 0 &&
          randrange(0, 1) == 1
        ) {
          //if they're equal, pick one at random
          planEndNode = this;
        }
        //console.log(pathSoFar + ' ' + aVal);
        //return true;
      } else {
        if (depth == 0) {
          var fLow = agent.getResourceValue('food', 'lowThreshold');
          var eLow = agent.getResourceValue('energy', 'lowThreshold');
          var mLow = agent.getResourceValue('money', 'lowThreshold');
          var fHigh = agent.getResourceValue('food', 'highThreshold');
          var eHigh = agent.getResourceValue('energy', 'highThreshold');
          var mHigh = agent.getResourceValue('money', 'highThreshold');

          this.valAvg = (this.fVal + this.eVal + this.mVal) / 3.0;

          var fBuff = (this.fVal - fHigh + Math.abs(this.fVal - fHigh)) / 2;
          var eBuff = (this.eVal - eHigh + Math.abs(this.eVal - eHigh)) / 2;
          var mBuff = (this.mVal - mHigh + Math.abs(this.mVal - mHigh)) / 2;
          var fNerf = (fLow - this.fVal + Math.abs(fLow - this.fVal)) / 2;
          var eNerf = (eLow - this.eVal + Math.abs(eLow - this.eVal)) / 2;
          var mNerf = (mLow - this.mVal + Math.abs(mLow - this.mVal)) / 2;
          this.aVal =
            this.valAvg + (fBuff + eBuff + mBuff) - (fNerf + eNerf + mNerf);

          //console.log('initial this.aVal: '+this.aVal);
        }
        //console.log('not deep');
        //TODO: change this to account for prices/exchange values/metabolism, etc.
        //for example... -1 food, plus (foodToEnergyExchangeRate*Metbolism) energy
        //				 +1 food, - (moneyToFoodExchangeRate*thrift)
        //				 -1 energy, + (energyToMoneyExchangeRate*skillMultiplier)

        //console.log('agent.region: '+agent.region.toString());
        //console.log(agent);
        var foodPrice = regions[agent.region].resources['food'].price;
        var energyPrice = regions[agent.region].resources['energy'].price;
        var energyPerFood = (energyPrice + 0.0) / (foodPrice + 0.0);
        //planStep(agent,parentStep,fd,ed,md,depth,maxDepth,pathSoFar)
        var stepF = new planStep(
          agent,
          this,
          1,
          0,
          foodPrice * -1,
          depth + 1,
          maxDepth,
          pathSoFar + 'F',
        );
        var stepE = new planStep(
          agent,
          this,
          -1,
          energyPerFood,
          0,
          depth + 1,
          maxDepth,
          pathSoFar + 'E',
        );
        var stepM = new planStep(
          agent,
          this,
          0,
          -1,
          energyPrice,
          depth + 1,
          maxDepth,
          pathSoFar + 'M',
        );
      }
    }

    var parentFood = this.getResourceValue('food', 'quantity');
    var parentEnergy = this.getResourceValue('energy', 'quantity');
    var parentMoney = this.getResourceValue('money', 'quantity');
    var planTree = planStep(
      this,
      { fVal: parentFood, eVal: parentEnergy, mVal: parentMoney },
      0,
      0,
      0,
      0,
      numberOfSteps,
      '',
    );

    //console.timeEnd('getPlanTimer');
    return { pathSoFar: planEndNode.pathSoFar, aVal: planEndNode.aVal };
  };

  //define a means to retrieve agent resource values
  agent.prototype.getMaxValRecName = function () {
    var maxValRec = -10000;
    var maxValRecName = 'Lies';

    if (this.maxRecName == '') {
      //effectively cache until changed
      //for (resourceIndex in this.resources){
      for (var i = 0; i < this.resourcesIndex.length; i++) {
        var resourceIndex = this.resourcesIndex[i];
        var resource = this.resources[resourceIndex];
        //console.log('resourceIndex: ' + resourceIndex + ', resource: ' + resource + ', resource.name: ' + resource.name);
        if (resource.quantity > maxValRec) {
          maxValRecName = resourceIndex;
          maxValRec = resource.quantity;
        } else if (resource.quantity == maxValRec) {
          if (randrange(1, 100) < 50) {
            maxValRecName = resourceIndex;
          }
        }
      }
    } else {
      return this.maxRecName;
    }
    this.maxRecName = maxValRecName; //effectively cache until changed
    return maxValRecName;
  };
}

//define a general purpose resource class for agents (and regions?)
resource = function () {
  //define an init for the resource class
  //function __init__(this){
  this.name = '';
  this.resourceID = guid();
  //this.minQThreshold = randrange(1,300);
  //this.maxQThreshold = randrange(700,1000);
  this.quantity = randrange(8, 92);
  this.highThreshold = randrange(80, 90);
  this.lowThreshold = randrange(10, 20);
  this.preference = (randrange(10, 90) + 0.0) / 100.0;
  //this.affinity = randrange(1,100); //[1,3]
  //this.sell = 0;
  //}
};

//agent is an obj looks like x{id:value, resources:{id,name,quantity,lowThreshold,highThreshold,preference}}
//agent.getMinValRecName looks at all resources of x and returns the one with he quantity value
agents = [];
agentIDs = [];
watchAgent = '';
//populate a list of agents w/ new agents
for (i = 0; i < 100; i++) {
  var newAgent = new agent();
  if (i == 0) {
    var watchAgent = newAgent.agentID;
    simLog('watchAgent = ' + watchAgent);
  }
  agentIDs.push(newAgent.agentID);
  //agents.push(newAgent);
  agents[newAgent.agentID] = newAgent;
}
simLog('agent length:' + associativeArrayLen(agents));

//give everyone random quantities of all the available resources
//TODO:allow for different distributions
var potentialResources = ['food', 'energy', 'money'];
for (x in agentIDs) {
  for (rec in potentialResources) {
    agents[agentIDs[x]].addResource(potentialResources[rec]);
  }
}
var watchF = agents[watchAgent].getResourceValue('food', 'quantity');
var watchE = agents[watchAgent].getResourceValue('energy', 'quantity');
var watchM = agents[watchAgent].getResourceValue('money', 'quantity');
simLog('watchF: ' + watchF + ', watchE: ' + watchE + ', watchM: ' + watchM);

var chartInstances = {};

function renderLineChart(chartKey, canvasId, chartData, chartOptions) {
  if (chartInstances[chartKey] && chartInstances[chartKey].destroy) {
    chartInstances[chartKey].destroy();
  }

  var canvas = document.getElementById(canvasId);
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  chartInstances[chartKey] = new Chart(ctx).Line(chartData, chartOptions);
}

function updateCharts() {
  //TODO: it looks like the price array may be getting contaminated... find out if and from where...
  var selectedMetric = document.getElementById('metricForm').metric.value;
  var metricLabel =
    selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1);

  //alert(document.getElementById('metricForm').metric.value);
  if (selectedMetric == 'price') {
    var chartValueArrays = regionResourcePrices.slice();
  } else if (selectedMetric == 'quantity') {
    var chartValueArrays = regionResourceQuantities.slice();
  } else if (selectedMetric == 'supply') {
    var chartValueArrays = regionResourceSupplies.slice();
  } else if (selectedMetric == 'demand') {
    var chartValueArrays = regionResourceDemands.slice();
  }

  if (
    !chartValueArrays ||
    chartValueArrays.length === 0 ||
    !chartValueArrays[0] ||
    !chartValueArrays[0][0]
  ) {
    return;
  }

  for (var i = 0; i < numberOfRegions; i++) {
    for (var j = 0; j < potentialResources.length; j++) {
      var priceArray = chartValueArrays[i][j].slice();
      var arrayBuffer = [];
      //convert price arrays to simplifyjs's format for reduction
      for (var k = 0; k < priceArray.length - 1; k += 2) {
        //var priceArrayElement =  priceArray[k];
        arrayBuffer.push((priceArray[k] + priceArray[k + 1]) / 2);
      }
      chartValueArrays[i][j] = arrayBuffer.slice();
    }
  }

  var labelArray = [];
  for (var i = 0; i < chartValueArrays[0][0].length / 10; i++) {
    labelArray.push((i * 10).toString());
  }
  var dataR0 = {
    labels: labelArray,
    datasets: [
      {
        label: 'Region 0 Food (' + metricLabel + ')',
        strokeColor: 'rgba(15,145,15,1)',
        fillColor: 'rgba(220,220,220,1)',
        pointColor: 'rgba(220,220,220,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(220,220,220,1)',
        data: chartValueArrays[0][0],
      },
      {
        label: 'Region 0 Energy (' + metricLabel + ')',
        strokeColor: 'rgba(13,13,145,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[0][1],
      },
      {
        label: 'Region 0 Money (' + metricLabel + ')',
        strokeColor: 'rgba(145,15,15,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[0][2],
      },
    ],
  };

  var dataR1 = {
    labels: labelArray,
    datasets: [
      {
        label: 'Region 1 Food (' + metricLabel + ')',
        strokeColor: 'rgba(15,145,15,1)',
        fillColor: 'rgba(220,220,220,1)',
        pointColor: 'rgba(220,220,220,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(220,220,220,1)',
        data: chartValueArrays[1][0],
      },
      {
        label: 'Region 1 Energy (' + metricLabel + ')',
        strokeColor: 'rgba(13,13,145,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[1][1],
      },
      {
        label: 'Region 1 Money (' + metricLabel + ')',
        strokeColor: 'rgba(145,15,15,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[1][2],
      },
    ],
  };

  var dataR2 = {
    labels: labelArray,
    datasets: [
      {
        label: 'Region 2 Food (' + metricLabel + ')',
        strokeColor: 'rgba(15,145,15,1)',
        fillColor: 'rgba(220,220,220,1)',
        pointColor: 'rgba(220,220,220,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(220,220,220,1)',
        data: chartValueArrays[2][0],
      },
      {
        label: 'Region 2 Energy (' + metricLabel + ')',
        strokeColor: 'rgba(13,13,145,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[2][1],
      },
      {
        label: 'Region 2 Money (' + metricLabel + ')',
        strokeColor: 'rgba(145,15,15,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[2][2],
      },
    ],
  };

  var dataR3 = {
    labels: labelArray,
    datasets: [
      {
        label: 'Region 3 Food (' + metricLabel + ')',
        strokeColor: 'rgba(15,145,15,1)',
        fillColor: 'rgba(220,220,220,1)',
        pointColor: 'rgba(220,220,220,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(220,220,220,1)',
        data: chartValueArrays[3][0],
      },
      {
        label: 'Region 3 Energy (' + metricLabel + ')',
        strokeColor: 'rgba(13,13,145,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[3][1],
      },
      {
        label: 'Region 3 Money (' + metricLabel + ')',
        strokeColor: 'rgba(145,15,15,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[3][2],
      },
    ],
  };

  var dataF = {
    labels: labelArray,
    datasets: [
      {
        label: 'Region 0 Food (' + metricLabel + ')',
        strokeColor: 'rgba(15,145,15,1)',
        fillColor: 'rgba(220,220,220,1)',
        pointColor: 'rgba(220,220,220,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(220,220,220,1)',
        data: chartValueArrays[0][0],
      },
      {
        label: 'Region 1 Food (' + metricLabel + ')',
        strokeColor: 'rgba(13,13,145,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[1][0],
      },
      {
        label: 'Region 2 Food (' + metricLabel + ')',
        strokeColor: 'rgba(145,15,15,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[2][0],
      },
      {
        label: 'Region 3 Food (' + metricLabel + ')',
        strokeColor: 'rgba(158,118,227,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[3][0],
      },
    ],
  };

  var dataE = {
    labels: labelArray,
    datasets: [
      {
        label: 'Region 0 Energy (' + metricLabel + ')',
        strokeColor: 'rgba(15,145,15,1)',
        fillColor: 'rgba(220,220,220,1)',
        pointColor: 'rgba(220,220,220,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(220,220,220,1)',
        data: chartValueArrays[0][1],
      },
      {
        label: 'Region 1 Energy (' + metricLabel + ')',
        strokeColor: 'rgba(13,13,145,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[1][1],
      },
      {
        label: 'Region 2 Energy (' + metricLabel + ')',
        strokeColor: 'rgba(145,15,15,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[2][1],
      },
      {
        label: 'Region 3 Energy (' + metricLabel + ')',
        strokeColor: 'rgba(158,118,227,1)',
        fillColor: 'rgba(151,187,205,1)',
        pointColor: 'rgba(151,187,205,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(151,187,205,1)',
        data: chartValueArrays[3][1],
      },
    ],
  };

  var dataOpts = {
    // Boolean - Whether to animate the chart
    animation: false,
    // Number - Number of animation steps
    // animationSteps: 1,
    // String - Animation easing effect
    //animationEasing: "easeOutQuart",
    // Boolean - If we should show the scale at all
    showScale: true,
    // Boolean - If we want to override with a hard coded scale
    scaleOverride: false,
    // ** Required if scaleOverride is true **
    // Number - The number of steps in a hard coded scale
    scaleSteps: null,
    // Number - The value jump in the hard coded scale
    scaleStepWidth: 10,
    // Number - The scale starting value
    scaleStartValue: null,
    // String - Colour of the scale line
    scaleLineColor: 'rgba(0,0,0,.1)',
    // Number - Pixel width of the scale line
    scaleLineWidth: 1,
    // Boolean - Whether to show labels on the scale
    scaleShowLabels: true,
    // Interpolated JS string - can access value
    scaleLabel: '<%=value%>',
    // Boolean - Whether the scale should stick to integers, not floats even if drawing space is there
    scaleIntegersOnly: true,
    // Boolean - Whether the scale should start at zero, or an order of magnitude down from the lowest value
    scaleBeginAtZero: true,
    // String - Scale label font declaration for the scale label
    scaleFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
    // Number - Scale label font size in pixels
    scaleFontSize: 12,
    // String - Scale label font weight style
    scaleFontStyle: 'normal',
    // String - Scale label font colour
    scaleFontColor: '#666',
    // Boolean - whether or not the chart should be responsive and resize when the browser does.
    responsive: true,
    // Boolean - whether to maintain the starting aspect ratio or not when responsive, if set to false, will take up entire container
    maintainAspectRatio: true,
    // Boolean - Determines whether to draw tooltips on the canvas or not
    showTooltips: true,
    // Function - Determines whether to execute the customTooltips function instead of drawing the built in tooltips (See [Advanced - External Tooltips](#advanced-usage-custom-tooltips))
    customTooltips: false,
    // Array - Array of string names to attach tooltip events
    tooltipEvents: ['mousemove', 'touchstart', 'touchmove'],
    // String - Tooltip background colour
    tooltipFillColor: 'rgba(0,0,0,0.8)',
    // String - Tooltip label font declaration for the scale label
    tooltipFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
    // Number - Tooltip label font size in pixels
    tooltipFontSize: 14,
    // String - Tooltip font weight style
    tooltipFontStyle: 'normal',
    // String - Tooltip label font colour
    tooltipFontColor: '#fff',
    // String - Tooltip title font declaration for the scale label
    tooltipTitleFontFamily:
      "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
    // Number - Tooltip title font size in pixels
    tooltipTitleFontSize: 14,
    // String - Tooltip title font weight style
    tooltipTitleFontStyle: 'bold',
    // String - Tooltip title font colour
    tooltipTitleFontColor: '#fff',
    // Number - pixel width of padding around tooltip text
    tooltipYPadding: 6,
    // Number - pixel width of padding around tooltip text
    tooltipXPadding: 6,
    // Number - Size of the caret on the tooltip
    tooltipCaretSize: 8,
    // Number - Pixel radius of the tooltip border
    tooltipCornerRadius: 6,
    // Number - Pixel offset from point x to tooltip edge
    tooltipXOffset: 10,
    // String - Template string for single tooltips
    tooltipTemplate: '<%if (label){%><%=label%>: <%}%><%= value %>',
    // String - Template string for single tooltips
    multiTooltipTemplate: '<%= value %>',
    // Function - Will fire on animation progression.
    //onAnimationProgress: function(){},
    // Function - Will fire on animation completion.
    //onAnimationComplete: function(){},
    ///Boolean - Whether grid lines are shown across the chart
    scaleShowGridLines: true,
    //String - Colour of the grid lines
    scaleGridLineColor: 'rgba(150,150,150,.05)',
    //Number - Width of the grid lines
    scaleGridLineWidth: 1,
    //Boolean - Whether to show horizontal lines (except X axis)
    scaleShowHorizontalLines: true,
    //Boolean - Whether to show vertical lines (except Y axis)
    scaleShowVerticalLines: true,
    //Boolean - Whether the line is curved between points
    bezierCurve: false,
    //Number - Tension of the bezier curve between points
    bezierCurveTension: 0.0,
    //Boolean - Whether to show a dot for each point
    pointDot: false,
    //Number - Radius of each point dot in pixels
    pointDotRadius: 2,
    //Number - Pixel width of point dot stroke
    pointDotStrokeWidth: 1,
    //Number - amount extra to add to the radius to cater for hit detection outside the drawn point
    pointHitDetectionRadius: 20,
    //Boolean - Whether to show a stroke for datasets
    datasetStroke: true,
    //Number - Pixel width of dataset stroke
    datasetStrokeWidth: 2,
    //Boolean - Whether to fill the dataset with a colour
    datasetFill: false,
    //String - A legend template
    legendTemplate:
      '<ul class="<%=name.toLowerCase()%>-legend"><% for (var i=0; i<datasets.length; i++){%><li><span style="background-color:<%=datasets[i].lineColor%>"></span><%if(datasets[i].label){%><%=datasets[i].label%><%}%></li><%}%></ul>',
  };

  if (logging) {
    console.time('chartTimer');
  }

  renderLineChart('region0', 'region0Chart', dataR0, dataOpts);
  renderLineChart('region1', 'region1Chart', dataR1, dataOpts);
  renderLineChart('region2', 'region2Chart', dataR2, dataOpts);
  renderLineChart('region3', 'region3Chart', dataR3, dataOpts);
  renderLineChart('food', 'foodChart', dataF, dataOpts);
  renderLineChart('energy', 'energyChart', dataE, dataOpts);

  if (logging) {
    console.timeEnd('chartTimer');
  }
}

//if(logging){console.log('');}
var currSellers = [];
//var globalPrices = [];
//var localPrices = [];

//do a full set trades
//TODO: thread this(by region?), in threads, go collect, for each agent, a list of other agents they could trade with, return, then, once all return... check those lists and purchase in series
var agentsProcessedPerIteration = [];
var TradesMadePerIteration = [];
var regionResourcePrices = [];
var regionResourceQuantities = [];
var regionResourceSupplies = [];
var regionResourceDemands = [];

function summarizeNumericArray(values) {
  if (!values.length) {
    return {
      total: 0,
      average: 0,
      median: 0,
      min: 0,
      max: 0,
    };
  }

  var total = 0;
  var min = values[0];
  var max = values[0];

  for (var i = 0; i < values.length; i++) {
    var value = values[i];
    total += value;
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  return {
    total: total,
    average: total / values.length,
    median: median(values.slice(0)),
    min: min,
    max: max,
  };
}

function runIterationsFromInput() {
  syncLoggingSetting();

  var iterationInput = document.getElementById('iterationCount');
  var parsedIterations = parseInt(iterationInput.value, 10);
  var iterationsToRun = parsedIterations;

  if (!isFinite(iterationsToRun) || iterationsToRun < 1) {
    iterationsToRun = 100;
  }

  iterationInput.value = iterationsToRun;

  var startingTradeIndex = TradesMadePerIteration.length;
  var startingDistances = {};
  for (var agentIndex = 0; agentIndex < agentIDs.length; agentIndex++) {
    var agentId = agentIDs[agentIndex];
    startingDistances[agentId] = agents[agentId].totalDistanceTraveled;
  }

  for (var i = 0; i < iterationsToRun; i++) {
    doIteration();
  }

  testCountRegions();
  testSupDem();
  testRegionalCalcPrices();
  updateCharts();

  var tradesThisRun = 0;
  for (
    var tradeIndex = startingTradeIndex;
    tradeIndex < TradesMadePerIteration.length;
    tradeIndex++
  ) {
    tradesThisRun += TradesMadePerIteration[tradeIndex];
  }

  var distanceDeltas = [];
  for (
    var summaryAgentIndex = 0;
    summaryAgentIndex < agentIDs.length;
    summaryAgentIndex++
  ) {
    var summaryAgentId = agentIDs[summaryAgentIndex];
    distanceDeltas.push(
      agents[summaryAgentId].totalDistanceTraveled -
        startingDistances[summaryAgentId],
    );
  }

  console.log('Simulation summary:', {
    iterationsRun: iterationsToRun,
    agentCount: agentIDs.length,
    totalTrades: tradesThisRun,
    agentDistanceTraveled: summarizeNumericArray(distanceDeltas),
  });
}

function doIteration() {
  if (logging) {
    console.time('doIterationTimer');
  }
  //calculate who's in which region, the prices in that region, and the supply and demand for each resource per region
  testRegionalCalcPrices();
  //globalPrices = [];
  //localPrices = [];

  //populate metrics arrays
  for (var i = 0; i < regions.length; i++) {
    //if first iteration initialize these arrays
    if (!regionResourcePrices[i]) {
      regionResourcePrices[i] = [];
    }
    if (!regionResourceQuantities[i]) {
      regionResourceQuantities[i] = [];
    }
    if (!regionResourceSupplies[i]) {
      regionResourceSupplies[i] = [];
    }
    if (!regionResourceDemands[i]) {
      regionResourceDemands[i] = [];
    }
    //for each resource,
    for (var j = 0; j < potentialResources.length; j++) {
      //if not initialized, initialize array
      if (!regionResourcePrices[i][j]) {
        regionResourcePrices[i][j] = [];
      }
      if (!regionResourceQuantities[i][j]) {
        regionResourceQuantities[i][j] = [];
      }
      if (!regionResourceSupplies[i][j]) {
        regionResourceSupplies[i][j] = [];
      }
      if (!regionResourceDemands[i][j]) {
        regionResourceDemands[i][j] = [];
      }

      //then add the current price to the relevant array
      var currRegionResource =
        regions[i].resources[regions[i].resourcesIndex[j]];
      regionResourcePrices[i][j].push(currRegionResource.price);
      regionResourceQuantities[i][j].push(currRegionResource.quantity);
      regionResourceSupplies[i][j].push(currRegionResource.supply);
      regionResourceDemands[i][j].push(currRegionResource.demand);
    }
    j = 0;
  }
  i = 0;

  if (logging) {
    var maxResourceCounts = [];
    maxResourceCounts['food'] = 0;
    maxResourceCounts['energy'] = 0;
    maxResourceCounts['money'] = 0;
    var initialAgents = agents.slice(0);
    console.log('agents:');
    console.log(agents);
  }

  var output = [];
  var agentsProcessed = 0;
  currSellers = [];
  for (currAgentIdIndex in agentIDs) {
    var currAgent = agents[agentIDs[currAgentIdIndex]];
    var currAgentId = agentIDs[currAgentIdIndex];

    if (currAgent.state == 1) {
      //console.log('hit a moving agent: '+currAgentId+' has '+currAgent.distToDest.toString()+ ' to go.'); //0 = waiting, 1 = moving;
      if (currAgent.distToDest >= 1) {
        currAgent.distToDest -= 1;
        currAgent.totalDistanceTraveled += 1;
      } else {
        currAgent.distToDest = 0;
        currAgent.state = 0;
      }
    } else {
      agentsProcessed += 1;
      if (logging) {
        //effectively counting total supply
        switch (currAgent.getMaxValRecName()) {
          case 'food':
            maxResourceCounts['food'] += 1;
            break;
          case 'money':
            maxResourceCounts['money'] += 1;
            break;
          case 'energy':
            maxResourceCounts['energy'] += 1;
            break;
        }
      }

      //console.log('firstPlanStep: '+currAgent);
      //console.log('firstPlanStep: '+currAgent.getPlan(5).pathSoFar);

      //if(currAgent.plan.length == 0){
      //	currAgent.plan = currAgent.getPlan(5).pathSoFar.split('');
      //}
      //var firstPlanStep = currAgent.plan[0];
      //currAgent.plan.splice(0,1);
      ////return;
      //if(firstPlanStep == 'F'){
      //	initialMinRec = 'food';
      //}else if(firstPlanStep == 'E'){
      //	initialMinRec = 'energy';
      //}else if(firstPlanStep == 'M'){
      //	initialMinRec = 'money';
      //}

      //find out what agent needs
      var initialMinRec = currAgent.getMinValRecName();

      //find out what agent has
      var neededResource = resolveNecessity(initialMinRec, currAgentId);
      //try to find another agent that has what currAgent needs
      var result = tryToGet(neededResource, currAgentId);

      if (logging) {
        console.log('tryToGet result:' + result.toString());
      }

      if (result) {
        output.push(currAgentId);
      } else {
        //console.log('whomp for ' + currAgentId.toString());
      }
    }
    //return output;
  }

  TradesMadePerIteration.push(output.length); //
  if (output.indexOf(watchAgent) > -1) {
    simLog('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    simLog('watchAgent is now');
    simLog('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  }
  //TradesMadePerIteration.push(output);//

  simLog(agents[watchAgent]);
  simLog(
    'watchAgent food: ' +
      agents[watchAgent].resources['food'].quantity.toString() +
      ', energy: ' +
      agents[watchAgent].resources['energy'].quantity.toString() +
      ', money: ' +
      agents[watchAgent].resources['money'].quantity.toString(),
  );
  if (logging) {
    console.log(
      'maxResourceCounts: food=' +
        maxResourceCounts['food'].toString() +
        ', money=' +
        maxResourceCounts['money'].toString() +
        ', energy=' +
        maxResourceCounts['energy'].toString(),
    );
    console.log('agents:');
    console.log(agents);
    console.log(output.length + ' trades made this round.');
    //for( agentID in output){
    //console.log('yay for ' + output[agentID]);
    //if(logging){}
    //console.log(output.length + ' agents made primary trades');
    //}
    console.log(getStats());
    if (agents === initialAgents) {
      console.log("'agents' has not changed");
    } else {
      console.log("'agents' has changed");
    }
    console.log(
      watchAgent + ' minRec = ' + agents[watchAgent].getMinValRecName(),
    );
    console.log(
      watchAgent + ' maxRec = ' + agents[watchAgent].getMaxValRecName(),
    );
    for (rec in potentialResources) {
      console.log(
        potentialResources[rec] +
          ' val for ' +
          watchAgent.toString() +
          ' = ' +
          agents[watchAgent].getResourceValue(
            potentialResources[rec],
            'quantity',
          ),
      );
    }
    for (kk in agentIDs) {
      console.log(agents[agentIDs[kk]].agentID);
      break;
    }
  }
  agentIDs = shuffle(agentIDs);
  if (logging) {
    for (kk in agentIDs) {
      console.log(agents[agentIDs[kk]].agentID);
      break;
    }
    //console.log('number of global prices: ' + globalPrices.length);
    //console.log(globalPrices.sort());
    //console.log('number of local prices: ' + localPrices.length);
    //console.log(localPrices);
    //console.log(localPrices.sort());
  }

  if (logging) {
    console.timeEnd('doIterationTimer');
  }
  agentsProcessedPerIteration.push(agentsProcessed);
  simLog('agentsProcessedPerIteration:');
  simLog(agentsProcessedPerIteration);
  simLog('TradesMadePerIteration:');
  simLog(TradesMadePerIteration);
  simLog('regionResourceQuantities:');
  simLog(regionResourceQuantities);
  simLog('regionResourceSupplies:');
  simLog(regionResourceSupplies);
  simLog('regionResourceDemands:');
  simLog(regionResourceDemands);
  for (var i = 0; i < regions.length; i++) {
    simLog('region ' + i.toString() + ': ');
    for (var j = 0; j < potentialResources.length; j++) {
      simLog(potentialResources[j].toString() + ' prices: ');
      simLog(regionResourcePrices[i][j]);
      simLog(regionResourcePrices[i][j].length.toString());
    }
    j = 0;
    simLog('');
  }
  i = 0;

  return output;
}

//for a given agent, attempt to find, then trade, a given resource
function tryToGet(boughtResource, buyerId) {
  if (logging) {
    console.log('trying to get ' + boughtResource + ' for ' + buyerId);
  }

  var isAvail = isAvailableB(boughtResource, buyerId);
  var sellerId = isAvail[0];
  var sellerWantedRec = isAvail[1];

  if (logging) {
    console.log('isAvail ' + isAvail.toString());
    console.log('typeof(isAvail) ' + typeof isAvail.toString());
  }

  if (typeof isAvail != 'string' && sellerId && sellerId != buyerId) {
    if (logging) {
      console.log(
        "and there's some available from " +
          sellerId.toString() +
          ' in exchange for some ' +
          sellerWantedRec.toString(),
      );
    }

    //if the resource isn't energy set the agent a-travelling
    //	is it ok to make sellers either sit still or meet the buyer?
    if (boughtResource != 'energy') {
      var rise = agents[buyerId].position.y - agents[sellerId].position.y;
      var run = agents[buyerId].position.x - agents[sellerId].position.x;
      var gridDistToAvail = Math.abs(rise) + Math.abs(run);
      agents[buyerId].state = 1;
      agents[sellerId].state = 1;
      agents[buyerId].distToDest = gridDistToAvail;
      agents[sellerId].distToDest = gridDistToAvail;
    }

    //calc the exchange rate based on the seller's region
    var paymentQuantity = getExchangeRate(sellerId, boughtResource);
    var sellerHasQuantity = agents[sellerId].getResourceValue(
      boughtResource,
      'quantity',
    );
    var buyerPaymentBalance = agents[buyerId].getResourceValue(
      sellerWantedRec,
      'quantity',
    );

    if (
      !isFinite(paymentQuantity) ||
      paymentQuantity <= 0 ||
      sellerHasQuantity < 1 ||
      buyerPaymentBalance < paymentQuantity
    ) {
      return false;
    }

    //transfer(resource, from, to, quantity);
    //take the goods
    transfer(boughtResource, sellerId, buyerId, 1);

    //console.log('');
    //console.log('paymentQuantity = ' + paymentQuantity.toString());
    //console.log('');
    //send the payment
    //transfer(sellerWantedRec, buyerId, sellerId, 1);
    transfer(sellerWantedRec, buyerId, sellerId, paymentQuantity);

    //currSellers.push(buyerId);
    currSellers.push(sellerId);
    return true;
  } else {
    return false;
  }
}

//this will return the cost of a thing in terms of the resource it's bought with
//food returns an amount of money, energy an amount of food, and money an amount of energy
function getExchangeRate(agent, resourceType) {
  var agent = agents[agent];
  //console.log('');
  //console.log('getExchangeRate func received ' + agent.agentID);
  //console.log('');
  var resourceType = resourceType.toLowerCase();
  //this one's basic pricing because the price of food comes in money
  var moneyPerFood = regions[agent.region].resources['food'].price;
  //this is normally money per energy... based on total energy and food in the world relative to money
  //so inverting makes it energy per money
  var energyPerMoney = 1 / regions[agent.region].resources['energy'].price;
  var foodPerEnergy = (moneyPerFood + 0.0) / (1 / energyPerMoney + 0.0);
  if (resourceType == 'food') {
    //money per food
    return moneyPerFood;
  } else if (resourceType == 'energy') {
    //food per energy
    return foodPerEnergy;
  } else if (resourceType == 'money') {
    //energy per money
    return energyPerMoney;
  } else {
    return 0;
  }
}

function transfer(resource, from, to, quantity) {
  if (logging && (from == watchAgent || to == watchAgent)) {
    console.log(
      'transfering ' +
        quantity.toString() +
        ' ' +
        resource.toString() +
        ' from ' +
        from.toString() +
        ' to ' +
        to.toString(),
    );
  }

  //transfer from the old owner
  var FromValue = agents[from].getResourceValue(resource, 'quantity');
  var newFromValue = FromValue - quantity;
  agents[from].setResourceValue(resource, 'quantity', newFromValue);
  var updatedFromValue = agents[from].getResourceValue(resource, 'quantity');

  //to the new owner
  var ToValue = agents[to].getResourceValue(resource, 'quantity');
  var newToValue = ToValue + quantity;
  agents[to].setResourceValue(resource, 'quantity', newToValue);
  var updatedToValue = agents[to].getResourceValue(resource, 'quantity');

  // || from  == watchAgent || to == watchAgent
  if (logging) {
    console.log('FromValue ' + FromValue);
    console.log('newFromValue ' + newFromValue);
    console.log('updatedFromValue ' + updatedFromValue);
    console.log('ToValue ' + ToValue);
    console.log('newToValue ' + newToValue);
    console.log('updatedToValue ' + updatedToValue);
  }
}

//figure out what someone really needs/what they have the resources to get
// if they need food but have no money... but do have energy... work for money so you can buy food next turn, etc.
function resolveNecessity(minRecName, asking) {
  //TODO: condense this w/ some fancy indexOf(possibleResources) biz
  //TODO: modify this to account for current resource prices
  //		replace "2" with the real exchange rate.
  //also, build a list of agents who are fucked and return at end b/c that's interesting
  if (minRecName == 'food') {
    var moneyNeededForFood = getExchangeRate(asking, 'food');
    var energyNeededForMoney = getExchangeRate(asking, 'money');
    if (
      isFinite(moneyNeededForFood) &&
      agents[asking].getResourceValue('money', 'quantity') >= moneyNeededForFood
    ) {
      //convert money to food
      return 'food';
    } else {
      // if(i have no money){
      if (
        isFinite(energyNeededForMoney) &&
        agents[asking].getResourceValue('energy', 'quantity') >=
          energyNeededForMoney
      ) {
        //try to work for money (to buy food)
        return 'money';
      } else {
        // if(i have no energy){
        fucked(asking);
        return 'fucked';
      }
    }
  } else if (minRecName == 'energy') {
    var foodNeededForEnergy = getExchangeRate(asking, 'energy');
    var moneyNeededForFood = getExchangeRate(asking, 'food');
    if (
      isFinite(foodNeededForEnergy) &&
      agents[asking].getResourceValue('food', 'quantity') >= foodNeededForEnergy
    ) {
      //convert some food to energy
      return 'energy';
    } else {
      // if(i have no food){
      if (
        isFinite(moneyNeededForFood) &&
        agents[asking].getResourceValue('money', 'quantity') >=
          moneyNeededForFood
      ) {
        //try to exchange money for food
        return 'food';
      } else {
        // if(i have no money){
        fucked(asking);
        return 'fucked';
      }
    }
  } else if (minRecName == 'money') {
    var energyNeededForMoney = getExchangeRate(asking, 'money');
    var foodNeededForEnergy = getExchangeRate(asking, 'energy');
    if (
      isFinite(energyNeededForMoney) &&
      agents[asking].getResourceValue('energy', 'quantity') >=
        energyNeededForMoney
    ) {
      //try to work for money
      return 'money';
    } else {
      // if(i have no energy){
      if (
        isFinite(foodNeededForEnergy) &&
        agents[asking].getResourceValue('food', 'quantity') >=
          foodNeededForEnergy
      ) {
        //convert some food to energy
        return 'energy';
      } else {
        // if(i have no food){
        fucked(asking);
        return 'fucked';
      }
    }
  }
}

//gridXSize
//this guy's got the hookup... he know who's got what YOU want, and he knows what THEY want

function isAvailableB(recName, asking) {
  //console.log('recName: '+recName);
  //startingResources = [];
  var output = 'default value';

  if (logging) {
    console.log('checking availability');
  }

  var innerAgentIDs = shuffle(agentIDs.slice(0)); //agentIDs.slice(0); //    //use this later... could hide error;

  for (var i = 0; i < innerAgentIDs.length; i++) {
    var innerAgentID = innerAgentIDs[i];
    var innerAgent = agents[innerAgentID];
    var askingAgent = agents[asking];

    //if the person who's asking for goods is not the person being asked...
    //		and the person has not already sold this round... proceed
    //console.log('CurrSellers = [' + currSellers + ']');
    if (asking != innerAgentID && currSellers.indexOf(innerAgentID) < 0) {
      var needsAlign = false;
      var askerHasMin = false;
      var offererHasMax = false;
      var iaMinLessThanAskerMax = false;
      var askerMinLessThaniaMax = false;

      //var exchange = [];
      //exchange['F'] = "M";
      //exchange['M'] = "E";
      ////exchange['E'] = "F";
      //if(innerAgent.plan.length > 0 && innerAgent.plan[0] == exchange[recName]){
      //	if(askingAgent can spare innerAgent.plan[0]){
      //		output = [innerAgentID, exchange[recName]];
      //		return output;
      //	}else{
      //	}
      //}else{
      //	output = 'offerings not aligned';
      //}

      //-----------------------------------------------------------------------------------------------

      //find the resource the currentAsked agent has most of
      var iaMax = innerAgent.getMaxValRecName();
      //find the resource the asker has most of
      var askerMax = askingAgent.getMaxValRecName();

      //if they have the same available, go to the next
      if (iaMax == askerMax) {
        continue;
      }

      //find the resource the currentAsked agent has least of
      var iaMin = innerAgent.getMinValRecName();

      //find the resource the asker agent has least of
      var askerMin = recName; //agents[asking].getMinValRecName();

      //TODO: break this out into a lookup so when there are more resources there's one lookup.
      //this may not be necessary... it can go: eat/work/buy
      //  but it can also go farm/sell/hire...
      //  removing moves from 70-ish to 135-ish trades per iteration
      // true ||
      if (
        (askerMin == 'food' && iaMin == 'money') || //askerMax == "money" is implied later by askerMax == iaMin as is iaMax == "food"
        (askerMin == 'money' && iaMin == 'energy') ||
        (askerMin == 'energy' && iaMin == 'food')
      ) {
        //askerMax == "energy" is implied later by askerMax == iaMin as is iaMax == "money"
        needsAlign = true;
      } else {
        needsAlign = false;
        output = 'resource flow not aligned';
        continue;
        //return output;
      }

      //find the amount of the resource the currentAsked agent has most of
      var iaMaxVal = innerAgent.getResourceValue(iaMax, 'quantity');
      var iaMinVal = innerAgent.getResourceValue(iaMin, 'quantity');

      //find the amount of the resource the asker agent has most of
      var askerMaxVal = askingAgent.getResourceValue(askerMax, 'quantity');
      var askerMinVal = askingAgent.getResourceValue(askerMin, 'quantity');

      //if logging, log some things
      if (logging > 1) {
        console.log('iaMin: ' + iaMin.toString());
        console.log('askerMax: ' + askerMax.toString());
        console.log('askerMaxVal: ' + askerMaxVal.toString());
      }

      //if the askee has the least of what the asker has most
      //TODO: change '2' to exchange-rate calculation
      if (iaMin == askerMax && askerMaxVal >= 2) {
        askerHasMin = true;
        //and needs it more than asker
        //TODO: determine whether this is really a requirement... the rich profit from the poor all the time.
        if (iaMinVal < askerMaxVal) {
          iaMinLessThanAskerMax = true;
        } else {
          //iaMinLessThanAskerMax = true;
          iaMinLessThanAskerMax = false;
        }
      } else {
        askerHasMin = false;
        output = "ia doesn't need what asker has or asker doesn't have enough";
        continue;
        //return output;
      }

      //if logging, log some things
      if (logging > 1) {
        console.log('askerMin: ' + askerMin.toString());
        console.log('iaMax: ' + iaMax.toString());
        console.log('iaMaxVal: ' + iaMaxVal.toString());
      }

      //if asker needs what ia has most of
      //TODO: change '2' to exchange-rate calculation
      if (askerMin == iaMax && iaMaxVal >= 2) {
        offererHasMax = true;
        //and asker needs it more than ia
        if (askerMinVal < iaMaxVal) {
          askerMinLessThaniaMax = true;
        } else {
          askerMinLessThaniaMax = false;
        }
      } else {
        offererHasMax = false;
        output = "ia doesn't have what asker needs or ia doesn't have enough";
        continue;
      }

      //if logging, log some things
      if (logging > 1) {
        console.log('askerHasMin: ' + askerHasMin.toString());
        console.log('offererHasMax: ' + offererHasMax.toString());
      }
      //if asker needs what askee has and askee needs what asker has... return agent who has it and what they want in exchange.
      if (askerHasMin && offererHasMax && needsAlign) {
        if (askerMinLessThaniaMax && iaMinLessThanAskerMax) {
          if (logging || innerAgentID == watchAgent || asking == watchAgent) {
            simLog(
              'askerID = ' + asking.toString() + ' offererID = ' + innerAgentID,
            );
          }
          output = [innerAgentID, iaMin];

          return output;
        }
      } else {
        //this should probably never be reached, so... be suspicious if it is.
        output = 'offerings not aligned';
        continue;
      }
    } else {
      output = 'agents the same or all in sellers list';
    }
  }
  return output;
}
function rollover(input, max) {
  var output = '';
  if (logging) {
    console.log(
      'rolling ' + input.toString() + 'over a max of ' + max.toString(),
    );
  }
  //replace with modulus?... handle negatives?
  if (input <= max) {
    output = input;
  } else {
    output = input - max;
  }
  return output;
}

function fucked(fuckee) {
  if (logging) {
    console.log(fuckee.toString() + ", you're fucked");
  }
  //define what happens if agent is fucked... ding health? check if health 0 and kill? spawn?
}

//TODO: fix this
function getStats() {
  var recStats = [];
  for (rec in potentialResources) {
    recStats['total' + potentialResources[rec]] = 0;
    recStats['listOf' + potentialResources[rec]] = [];
    for (x in agentIDs) {
      var currRecVal = agents[agentIDs[x]].getResourceValue(
        potentialResources[rec],
        'quantity',
      );

      recStats['listOf' + potentialResources[rec]].push(currRecVal);
      recStats['total' + potentialResources[rec]] += currRecVal;
    }
    recStats['avg' + potentialResources[rec]] =
      recStats['total' + potentialResources[rec]] / associativeArrayLen(agents);
    recStats['med' + potentialResources[rec]] = median(
      recStats['listOf' + potentialResources[rec]],
    );
  }

  return recStats;
}

function regionResource(iname) {
  this.name = iname || '';
  this.resourceID = guid();
  this.supply = 0;
  this.demand = 0;
  this.quantity = 0;
  this.price = 0;
}

function region(itopLeft, ibottomRight) {
  //this.agents = [];
  this.id = guid();
  this.agentsIndex = [];
  this.topLeft = itopLeft || { x: 0, y: 0 };
  this.bottomRight = ibottomRight || { x: 0, y: 0 };
  this.resources = [];
  this.resourcesIndex = [];
  //initialize resources
  for (var k = 0; k < potentialResources.length; k++) {
    var currResourceName = potentialResources[k];
    this.resources[currResourceName] = new regionResource(currResourceName);
    this.resourcesIndex.push(currResourceName);
  }
}

function testCountRegions() {
  var sqrtOfRegionCt = Math.sqrt(numberOfRegions);
  //TODO: validate sqrtOfRegionCt is a real integer
  if (regions.length < numberOfRegions) {
    for (var i = 0; i < sqrtOfRegionCt; i++) {
      for (var j = 0; j < sqrtOfRegionCt; j++) {
        var topY = i * (gridYSize / sqrtOfRegionCt);
        var leftX = j * (gridXSize / sqrtOfRegionCt);
        var bottomY = (i + 1) * (gridYSize / sqrtOfRegionCt);
        var rightX = (j + 1) * (gridXSize / sqrtOfRegionCt);
        var topLeft = { x: leftX, y: topY };
        var bottomRight = { x: rightX, y: bottomY };
        regions.push(new region(topLeft, bottomRight));
      }
    }
  }

  //this for-in has shown to be faster... idk why, feel free to sub out if future-me knows better
  for (var i = 0; i < numberOfRegions; i++) {
    regions[i].agentsIndex = [];
  }

  for (var currAgentIdIndex in agentIDs) {
    //console.log(currAgentIdIndex);
    var currAgent = agents[agentIDs[currAgentIdIndex]];
    for (var i = 0; i < numberOfRegions; i++) {
      //console.log(currAgent.agentID + ': ' + i.toString());
      //if agent in this region, add it to the region's agent list
      if (
        currAgent.position.x >= regions[i].topLeft.x &&
        currAgent.position.x <= regions[i].bottomRight.x &&
        currAgent.position.y >= regions[i].topLeft.y &&
        currAgent.position.y <= regions[i].bottomRight.y
      ) {
        //add the current agent's id to the region's agent list

        //regions[i].agentsIndex.push(currAgent.agentID);
        currAgent.region = i;
        regions[i].agentsIndex.push(currAgent.agentID);

        break;
      }
    }
  }
}

//potentialResources
function testSupDem() {
  //for each region
  for (var i = 0; i < numberOfRegions; i++) {
    var currRegion = regions[i];
    for (var k = 0; k < potentialResources.length; k++) {
      var currResourceName = potentialResources[k];
      currRegion.resources[currResourceName].quantity = 0;
      currRegion.resources[currResourceName].supply = 0;
      currRegion.resources[currResourceName].demand = 0;
    }
    //for each agent in this region
    for (var j = 0; j < currRegion.agentsIndex.length; j++) {
      var currAgent = agents[currRegion.agentsIndex[j]];
      //for each type of resource (to get totals for region)
      for (var k = 0; k < potentialResources.length; k++) {
        var currResourceName = potentialResources[k];
        var currAgentCurrRecVal = currAgent.getResourceValue(
          currResourceName,
          'quantity',
        );
        currRegion.resources[currResourceName].quantity += currAgentCurrRecVal;
      }

      //supply
      currRegion.resources[currAgent.getMaxValRecName()].supply += 1;

      //demand
      currRegion.resources[currAgent.getMinValRecName()].demand += 1;
    }
  }
}

function testRegionalCalcPrices() {
  testCountRegions();
  testSupDem();
  //output total, sup, dem and ratio for all resources in all regions
  for (var i = 0; i < numberOfRegions; i++) {
    var currRegion = regions[i];
    var quantityOfNonMoney = 0;
    var nonMoneyValueMultiplier = 0;
    //console.log(regions);
    //console.log(i);
    var quantityOfMoney = currRegion.resources['money'].quantity;
    var safeQuantityOfMoney = Math.max(quantityOfMoney, 0.0001);
    //console.log('quantityOfMoney: ' + quantityOfMoney);
    for (var k = 0; k < potentialResources.length; k++) {
      var currResourceName = potentialResources[k];
      if (potentialResources[k] != 'money') {
        quantityOfNonMoney += currRegion.resources[currResourceName].quantity;
      }
    }

    for (var k = 0; k < potentialResources.length; k++) {
      var currResourceName = potentialResources[k];
      if (potentialResources[k] != 'money') {
        var nonMoneyResourceQuantity = Math.max(
          currRegion.resources[currResourceName].quantity,
          0.0001,
        );
        nonMoneyValueMultiplier +=
          quantityOfNonMoney / nonMoneyResourceQuantity;
      }
    }

    nonMoneyValueMultiplier = Math.max(nonMoneyValueMultiplier, 0.0001);

    for (var k = 0; k < potentialResources.length; k++) {
      var currResourceName = potentialResources[k];
      if (potentialResources[k] != 'money') {
        var currResource = currRegion.resources[currResourceName];
        var currResourceQuantity = currResource.quantity;
        var supply = currResource.supply;
        var demand = currResource.demand;
        //percent of non-money assets current resource represents
        //	times the ratio of demand to supply, so if there's more demand than supply, the price goes up
        //	times the money supply, so total amount of this resource is proportionally allotted it's share of all money
        //result of above, divided by currResourceQuantity, so price is on a per-unit basis

        //currResource.price = (((currResourceQuantity/quantityOfNonMoney)*(demand/supply)*quantityOfMoney))/currResourceQuantity;
        var safeCurrResourceQuantity = Math.max(currResourceQuantity, 0.0001);
        var demandPressure = (demand + 1) / (supply + 1);
        demandPressure = Math.max(0.5, Math.min(2.0, demandPressure));

        currResource.price =
          ((safeQuantityOfMoney / nonMoneyValueMultiplier) *
            (quantityOfNonMoney / safeCurrResourceQuantity)) /
          safeCurrResourceQuantity;
        currResource.price *= demandPressure;
        //console.log(currResource.name + ' price: ' + currResource.price.toString());
      }
    }
  }
}
