/*
  Uchenna Maduno
  Marshal Rice
  Daniel Visser
  Vincent Hung

  Loyalty and Discounts API Lambda Function
*/

const AWS = require("aws-sdk");
AWS.config.update({
  region: "us-east-1"
});

// set up variable to use for Dynamo DB as "dynamodb" & save the name of DynamoDB as "demoapi"
const dynamodb = new AWS.DynamoDB.DocumentClient();
const dynamodbTableName = "discountapi";

const discountByIdPath = "/discount/{id}";
const discountsPath = "/discounts";

const requiredFields = ["id", "name", "type", "amount", "description", "accessCode", "startDate", "endDate"];
const querySortingParameters = ["SortNameAsc", "SortNameDesc", "SortStartDate", "SortEndDate", "SortAccessCodeAsc", "SortAccessCodeDesc"];
const queryIdentifyingParameters = ["name", "accessCode", "startDate", "endDate", "type"];

exports.handler = async function(event) {

  let response;
  const requestBody = JSON.parse(event.body);
  switch (true) {
    // GET event
    case event.httpMethod === "GET" && event.requestContext.resourcePath === discountsPath:
      if (event.queryStringParameters) {
        var onlySort = true;
        var filter_type, filter;
        var sort_type;
        //search for filter
        for (let key of queryIdentifyingParameters) {
          //filter type exist
          if (key in event.queryStringParameters) {
            onlySort = false;
            filter_type = key;
            filter = event.queryStringParameters[key];
            break;
          }
        }
        for (let sortKey of querySortingParameters) {
          //filter & sort exist
          if (sortKey in event.queryStringParameters) {
            sort_type = sortKey;
            break;
          }
        }
        console.error("sort type = "+sort_type);
        //Because there is no filter in query(at least one)
        if(onlySort){
          //search for sort
          response = await filterAndSortDiscounts("N/A", null, sort_type);
        }else{
          if(sort_type){
            response = await filterAndSortDiscounts(filter_type, filter, sort_type);
          }else{
            response = await filterAndSortDiscounts(filter_type, filter);
          }
        }
      } else {
        response = await getDiscounts();
      }
      break;

    case event.httpMethod === "GET" && event.requestContext.resourcePath === discountByIdPath:
      response = await getDiscount(event.pathParameters.id);
      break;

    // POST event
    case event.httpMethod === "POST" && event.requestContext.resourcePath === discountsPath:
      response = await postDiscount(requestBody);
      break;

    // PUT event
    case event.httpMethod === "PUT" && event.requestContext.resourcePath === discountsPath:
      response = await saveDiscounts(requestBody);
      break;

    case event.httpMethod === "PUT" && event.requestContext.resourcePath === discountByIdPath:
      requestBody["id"] = event.pathParameters.id;
      response = await saveDiscount(requestBody);
      break;

    // PATCH event
    case event.httpMethod === "PATCH" && event.requestContext.resourcePath === discountsPath:
      response = await modifyDiscount(requestBody.id, requestBody.updateKey,
        requestBody.updateValue);
      break;

    case event.httpMethod === "PATCH" && event.requestContext.resourcePath === discountByIdPath:
      response = await modifyDiscount(event.pathParameters.id, requestBody.updateKey,
        requestBody.updateValue);
      break;

    // DELETE event
    case event.httpMethod === "DELETE" && event.requestContext.resourcePath === discountsPath:
      response = await deleteAllDiscounts();
      break;
      
    case event.httpMethod === "DELETE" && event.requestContext.resourcePath === discountByIdPath:
      response = await deleteDiscount(event.pathParameters.id);
      break;

    default:
      response = buildResponse(404, { message: "Not Found" });
  }

  return response;
}

// function for filtering and sorting discounts
async function filterAndSortDiscounts(filter_type, filter, sort_type) {
  var params;
    if(filter_type != "N/A"){
      params = {
        TableName: dynamodbTableName,
        FilterExpression: '#filter_type = :value', // Use FilterExpression for non-key attributes
        ExpressionAttributeNames: {
          '#filter_type': filter_type,
        },
        ExpressionAttributeValues: {
          ':value': filter,
        },
      };
    }else{
      params = {
        TableName: dynamodbTableName,
      };
    }
  try {
    const result = await dynamodb.scan(params).promise();

    if (result.Items.length === 0) {
      return buildResponse(404, { message: 'No items found' });
    }
    //"SortNameAsc", "SortNameDesc", "SortStartDate", "SortEndDate", 
    //"SortAccessCodeAsc", "SortAccessCodeDesc"
    switch (sort_type) {
        case 'SortNameAsc':
          
          result.Items.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'SortNameDesc':
          result.Items.sort((a, b) => b.name.localeCompare(a.name));
          break;
        case 'SortStartDate':
          result.Items.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
          break;
        case 'SortEndDate':
          result.Items.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
          break;
        case 'SortAccessCodeAsc':
          result.Items.sort((a, b) => a.accessCode.localeCompare(b.accessCode));
          break;
        case 'SortAccessCodeDesc':
          result.Items.sort((a, b) => b.accessCode.localeCompare(a.accessCode));
          break;
        default:
          // Default sorting by ID
          result.Items.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      }
    return buildResponse(200, result.Items);
  } catch (error) {
    console.error("500 Internal Server Error", error);
    return buildResponse(500, { message: 'Internal server error' });
  }
}

// function to return a discount by ID from the database
async function getDiscount(discountId) {
  const params = {
    TableName: dynamodbTableName,
    Key: {
      "id": discountId
    }
  };

  return await dynamodb.get(params).promise().then((response) => {
    if (response.Item) {
      return buildResponse(200, response.Item);
    } else {
      return buildResponse(404, { message: "Discount not found" });
    }
  }, (error) => {
    console.error("Error while fetching the discount: ", error);
    return buildResponse(500, { message: "Internal server error" });
  });
}
// return all discounts from the DB
async function getDiscounts(queryParams) {
  const scanParams = {
    TableName: dynamodbTableName,
  };

  if (queryParams && queryParams.name) {
    // Add a filter expression to filter by the name "Spring Deal"
    scanParams.FilterExpression = "#name = :nameValue";
    scanParams.ExpressionAttributeNames = {
      "#name": "name"
    };
    scanParams.ExpressionAttributeValues = {
      ":nameValue": queryParams.name
    };
  }

  const allDiscounts = await scanDynamoRecords(scanParams, []);
  const body = {
    discounts: allDiscounts,
  };
  return buildResponse(200, body);
}


async function scanDynamoRecords(scanParams, itemArray) {
  try {
    const dynamoData = await dynamodb.scan(scanParams).promise();
    itemArray = itemArray.concat(dynamoData.Items);
    if (dynamoData.LastEvaluatedKey) {
      scanParams.ExclusiveStartKey = dynamoData.LastEvaluatedKey;
      return await scanDynamoRecords(scanParams, itemArray);
    }
    return itemArray;
  } catch (error) {
    console.error("Error while scanning DynamoDB records: ", error);
    return buildResponse(500, { message: "Internal server error" });
  }
}

// Helper function to check if the date has the expected format
function isValidDateFormat(dateString) {
   // Regular expression for MM,DD,YYYY format
  const dateFormatRegex = /^\d{2},\d{2},\d{4}$/;

  return dateFormatRegex.test(dateString);
}

// Validate function to check if a field is present in the request body
function validateField(field, requestBody) {
  if (!requestBody[field]) {
    return buildResponse(400, { message: `${field} is required` });
  }
}

// Used to add or update a discount in the dynamo database
async function saveDiscount(requestBody) {

  // Check for wrong attributes being used
  if (Object.keys(requestBody).length != requiredFields.length) {
    return buildResponse(400, {
      message: "Discount object size mismatch, expected "
      + requiredFields.length + " properties"});
  }

  // Validate required fields
  for (const field of requiredFields) {
    const validationResponse = validateField(field, requestBody);
    if (validationResponse) {
      return validationResponse;
    }
  }

  

  // Check if the ID is not a negative number
  if (parseInt(requestBody.id) < 0) {
    return buildResponse(400, { message: "ID cannot be a negative number" });
  }

  // Validate startDate and endDate format
  if (!isValidDateFormat(requestBody.startDate) || !isValidDateFormat(requestBody.endDate)) {
    return buildResponse(400, { message: "Invalid date format. Please use the specified format." });
  }

  const params = {
    TableName: dynamodbTableName,
    Item: requestBody
  }

  return await dynamodb.put(params).promise().then(() => {
    const body = {
      Operation: "SAVE",
      Message: "SUCCESS",
      Item: requestBody,
    };
    return buildResponse(200, body);
  }, (error) => {
    console.error("Error while saving the discount: ", error);
    return buildResponse(500, { message: "Internal server error" });
  });
}

async function saveDiscounts(requestBody) {
  for (const discount of requestBody) {
    // Check for wrong attributes being used
    if (Object.keys(discount).length != requiredFields.length) {
      return buildResponse(400, {
        message: "Discount object size mismatch, expected "
        + requiredFields.length + " properties"});
    }
    
    // Validate required fields for each discount
    for (const field of requiredFields) {
      const validationResponse = validateField(field, discount);
      if (validationResponse) {
        return validationResponse;
      }
    }

    // Check if the ID is not a negative number
    if (parseInt(discount.id) < 0) {
      return buildResponse(400, { message: "ID cannot be a negative number" });
    }

    // Validate startDate and endDate format (assuming you want a specific format)
    if (!isValidDateFormat(discount.startDate) || !isValidDateFormat(discount.endDate)) {
      return buildResponse(400, { message: "Invalid date format. Please use the specified format." });
    }
  }

  // If all validations pass, proceed to save the discounts
  const params = {
    RequestItems: {
      [dynamodbTableName]: requestBody.map(discount => ({
        PutRequest: {
          Item: discount,
        },
      })),
    },
  };

  return await dynamodb.batchWrite(params).promise().then(() => {
    const body = {
      Operation: "SAVE",
      Message: "SUCCESS",
      Item: requestBody,
    };
    return buildResponse(200, body);
  }, (error) => {
    console.error("Error while saving discounts: ", error);
    return buildResponse(500, { message: "Internal server error" });
  });
}

// Used to add a discount in the dynamo database for a POST call
// Validates that ID is non-negative, that ID is unique, 
// endDate and startDate formatting
async function postDiscount(requestBody) {
  // Validate required fields for each discount in the array
  for (const discount of requestBody) {
    // Check for wrong attributes being used
    if (Object.keys(discount).length != requiredFields.length) {
      return buildResponse(400, {
        message: "Discount object size mismatch, expected "
        + requiredFields.length + " properties"});
    }

    for (const field of requiredFields) {
      const validationResponse = validateField(field, discount);
      if (validationResponse) {
        return validationResponse;
      }
    }

    // Check if the ID is not a negative number
    if (parseInt(discount.id) < 0) {
      return buildResponse(400, { message: "ID cannot be a negative number" });
    }

    // Check if the ID already exists ***only if this is a POST method***
    const existingDiscount = await getDiscount(discount.id);
    if (existingDiscount.statusCode === 200) {
      return buildResponse(400, { message: `Discount with ID ${discount.id} already exists` });
    }

    // Validate startDate and endDate format
    if (!isValidDateFormat(discount.startDate) || !isValidDateFormat(discount.endDate)) {
      return buildResponse(400, { message: "Invalid date format. Please use the specified format." });
    }
  }

  const params = {
    RequestItems: {
      [dynamodbTableName]: requestBody.map(discount => ({
        PutRequest: {
          Item: discount,
        },
      })),
    },
  };

  return await dynamodb.batchWrite(params).promise().then(() => {
    const body = {
      Operation: "SAVE",
      Message: "SUCCESS",
      Item: requestBody,
    };
    return buildResponse(200, body);
  }, (error) => {
    console.error("Error while saving discounts: ", error);
    return buildResponse(500, { message: "Internal server error" });
  });
}

//deletes a discount via its discountID
async function deleteDiscount(discountId) {
  //creates a variable that holds the discount information of the Discount that is wanting to be deleted
  const params = {
    TableName: dynamodbTableName,
    Key: {
      "id": discountId,
    },
    ReturnValues: "ALL_OLD",
  };

  //deletes the Discount in DynamoDB and curates a reponse based on it's success/failure to delete said Discount
  return await dynamodb.delete(params).promise().then((response) => {
    //successfully deleted the discount response body
    if (response.Attributes) {
      //creates the successfully deleted discount response body
      const body = {
        Operation: "DELETE",
        Message: "SUCCESS",
        Item: response.Attributes,
      };
      //curates the successfully deleted discount HTTP response
      return buildResponse(200, body);
    } else {
      //curates an HTTP response that says it could not find said discount that is wanting to be deleted
      return buildResponse(404, { message: "Discount not found" });
    }
  }, (error) => {
    //curates an HTTP error response that corresponds to the failure of the delete discount operation
    console.error("Error while deleting the discount: ", error);
    return buildResponse(500, { message: "Internal server error" });
  });
  //sends its corresponding response back to the response variable at the beginning of the function
}

//deletes all discounts and produces a response body based on it's success/failure to do so
async function deleteAllDiscounts() {
  //set a variable that holds the DynamoDB table name
  const scanParams = {
    TableName: dynamodbTableName,
  };

  try {
    // Scan and retrieve all discounts
    const allDiscounts = await scanDynamoRecords(scanParams, []);

    // Delete each discount one by one
    for (const discount of allDiscounts) {
      await deleteDiscount(discount.id);
    }
    //curates a HTTP response for the full delete operation
    return buildResponse(200, { message: "All discounts deleted successfully" });
  } catch (error) {
    //curates a HTTP error reponse for a failed delete operation
    console.error("Error while deleting all discounts: ", error);
    return buildResponse(500, { message: "Internal server error" });
  }
}

//changes a discount via it's MemberId and updateKay with it's updateValue
async function modifyDiscount(MemberId, updateKey, updateValue) {
  // Check if the ID is not a negative number
  if (parseInt(MemberId) < 0) {
    return buildResponse(400, { message: "ID cannot be a negative number" });
  }

  if (!requiredFields.includes(updateKey)) {
    return buildResponse(400, {message: "Invalid key '" + updateKey + "'"});
  }

  // Check to make sure that a discount of this ID is in the DB
  const existingDiscount = await getDiscount(MemberId);
  if (existingDiscount.statusCode === 404) {
    return buildResponse(400, { message: "Discount with this ID does not exist"});
  }

  //creates a newly updated discount object
  const params = {
    //states the DynamoDB table location and it's id
    TableName: dynamodbTableName,
    Key: {
      "id": MemberId
    },
    //creates corresponding variables to set the updateKey equal to it's updateValue
    UpdateExpression: `set #name = :value`,
    ExpressionAttributeNames: {
      "#name": updateKey
    },
    ExpressionAttributeValues: {
      ":value": updateValue
    },
    ReturnValues: "UPDATED_NEW"
  }
  //adds the update in DynamoDB and creates response bodies afterward based on its success/failure to update
  return await dynamodb.update(params).promise().then((response) => {
    //successfully updated response body
    const body = {
      Operation: "UPDATE",
      Message: "SUCCESS",
      UpdatedAttributes: response
    }
    //curates the HTTP response
    return buildResponse(200, body);
  }, (error) => {
    //error response body
    console.error(
      "Do your custom error handling here. I am just gonna log it: ",
      error);
    //curates the error HTTP response
    return buildResponse(400, error);
  })
}

//Creates a reponse body that resembles HTTP syntax in JSON
function buildResponse(statusCode, body) {
  //returns the statusCode, JSON language, and the response body that corresponds to said statusCode
  return {
    statusCode: statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }
}
