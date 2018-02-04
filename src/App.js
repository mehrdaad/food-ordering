import React, { Component } from 'react';
import * as CSVParser from 'papaparse';
import * as R from 'ramda';
import Joi from 'joi-browser';
import axios from 'axios';

// file uploader
import Dropzone from 'react-dropzone';

// styles
import '../node_modules/css-toggle-switch/dist/toggle-switch.css';
import './App.css';

import { max, parse, format } from 'date-fns';

// utility functions

/*
 * input array of objects, containing orders
 * outputs the same array, by extracting and putting the restaurant name as a property
 */
const extractRestaurantNames = surveyData => {
  const restaurantNamePattern = /\[.+\]/;

  return surveyData.map(order => {
    if (!order.meal) return '';
    return {
      meal: R.trim(order.meal || ''),
      restaurant: R.toLower(
        R.match(restaurantNamePattern, R.trim(order.meal))[0] ||
          '[unknown_restaurant]',
      ),
      email: order['Email Address'],
      requestedBy: order['Email Address'].split('@')[0],
    };
  });
};

/**
 * ordersSchemaIsInvalid
 *
 * @returns {null} or an {object} containing validation error details
 */
const ordersSchemaIsInvalid = orders => {
  const restaurantNamePattern = /\[.+\]/;
  const ordersSchema = Joi.array().items(
    Joi.object({
      Timestamp: Joi.date().required(),
      'Email Address': Joi.string().email().required(),
      meal: Joi.string().min(5).regex(restaurantNamePattern).required(),
    }),
  );

  return Joi.validate(orders, ordersSchema, { allowUnknown: true }).error;
};

/**
 * getLatestOrder
 * Which order is the newest?
 * @returns {Date}
 */
const getLatestOrder = ({ orders = [] }) =>
  max.apply(null, orders.map(order => parse(order.Timestamp)));

const groupByRestaurants = data => {
  const byRestaurant = R.groupBy(order => order.restaurant);
  return byRestaurant(data);
};

const groupByMeals = data => {
  const reducer = (acc, order) => {
    if (!acc[order.meal]) {
      acc[order.meal] = 1;
    } else {
      acc[order.meal] = acc[order.meal] + 1;
    }

    return acc;
  };

  const countMeals = value => value.reduce(reducer, {});

  return R.map(countMeals, data);
};

const persistToDatabase = data =>
  axios.post('/api/survey-data/add', { surveyData: data });

// Our one and only App, the main react component in this application
class App extends Component {
  constructor() {
    super();
    this.state = {
      surveyData: [],
      error: null,
      adminView: false,
      loading: false,
    };
  }

  onDrop = files => {
    let onComplete = this.parseComplete;

    let CSVParserConfig = {
      delimiter: '', // auto-detect
      newline: '', // auto-detect
      quoteChar: '"',
      header: true,
      dynamicTyping: false,
      preview: 0,
      encoding: '',
      worker: false,
      comments: false,
      step: undefined,
      complete: onComplete,
      error: undefined,
      download: false,
      skipEmptyLines: true,
      chunk: undefined,
      fastMode: undefined,
      beforeFirstChunk: undefined,
      withCredentials: undefined,
    };

    CSVParser.parse(files[0], CSVParserConfig);
  };

  parseComplete = async results => {
    const orders = results['data'];

    // clear previous orders
    this.setState({ surveyData: [] });

    if (ordersSchemaIsInvalid(orders)) {
      this.setState({
        surveyData: [],
        error: ordersSchemaIsInvalid(orders),
      });

      return;
    }

    this.setState({
      surveyData: orders,
      error: null,
    });

    await persistToDatabase(orders);
  };

  async componentDidMount() {
    try {
      const { survey_data } = (await axios.get('/api/survey-data/latest')).data;
      this.setState({
        surveyData: survey_data,
        error: null,
        loading: false,
      });
    } catch (e) {
      console.log('Getting data from database panic!: ', e);
      this.setState({
        surveyData: [],
        error: { error: { details: [e.message] } },
        loading: false,
      });
    }
  }

  clearSurveyData = () => {
    console.log('clear clicked');
    if (
      window.confirm(
        'Are you sure you want to cleare these information and upload a new file?',
      )
    ) {
      this.setState({
        surveyData: [],
        error: null,
        loading: false,
      });
    }
  };

  handleAdminSwitchChange = event => {
    this.setState({
      adminView: event.target.checked,
    });
  };

  // let rendering begin!
  render() {
    return (
      <div className="App">
        <section className="wrapper">
          <header className="App-header">
            <h1 className="App-title">Food Ordering</h1>
            <AdminSwitch
              handleChange={this.handleAdminSwitchChange}
              checked={this.state.adminView}
            />
          </header>

          <div className="content">
            {this.state.error && <ErrorContainer error={this.state.error} />}
            {this.state.loading &&
              <div class="loading-holder">
                <div className="loading" />Loading...
              </div>}
            {this.state.surveyData &&
              this.state.adminView &&
              !R.isEmpty(this.state.surveyData) &&
              <LatestOrderNotice
                surveyData={this.state.surveyData}
                quantity={R.path(['surveyData', 'length'], this.state)}
                clear={this.clearSurveyData}
              />}
            <div className="file-uploader">
              {(!this.state.surveyData || R.isEmpty(this.state.surveyData)) &&
                <Dropzone
                  onDrop={this.onDrop}
                  disablePreview={true}
                  multiple={false}
                  style={{
                    display: 'flex',
                    border: '5px dashed #00BCD4',
                    width: '90%',
                    maxWidth: '1200px',
                    minHeight: '200px',
                    justifyContent: 'center',
                    background: 'rgba(0, 188, 212, 0.07)',
                    margin: '10px auto',
                    fontSize: '26px',
                    lineHeight: '3',
                  }}
                >
                  <p>
                    Drop the orders .csv file here.
                    <br /> Or click here to open a file browser
                    <br /> <i> (The file that you got from google forms) </i>
                  </p>
                </Dropzone>}
            </div>
            {this.state.surveyData &&
              this.state.adminView &&
              <div className="mailer">
                <Mailer surveyData={this.state.surveyData} />
              </div>}

            {this.state.surveyData &&
              this.state.adminView &&
              <div className="orders">
                <RestaurantOrders surveyData={this.state.surveyData} />
              </div>}
            <div className="who-ordered-what">
              <WhoOrderedWhat surveyData={this.state.surveyData} />
            </div>
          </div>
        </section>
        <footer className="footer">
          <a href="https://github.com/omidfi/food-ordering" className="fork-me">
            {' '}Fork me on Github{' '}
          </a>
        </footer>
      </div>
    );
  }
}

// Stateless React components start here!

const RestaurantOrders = ({ surveyData = [] }) => {
  const orders = groupByMeals(
    groupByRestaurants(extractRestaurantNames(surveyData)),
  );
  return (
    <div className="restaurant-orders">
      {R.isEmpty(orders) &&
        <p className="restaurant-orders__p">
          Orders and buttons will appear down here after uploading the file
        </p>}
      {!R.isEmpty(orders) &&
        <p className="restaurant-orders__p">
          The following need to be sent to the restaurants by email
        </p>}
      {orders &&
        Object.keys(orders).map((restaurant, i) =>
          <div key={i} className="restaurant-orders__div">
            <span className="restaurant-orders__span">
              {' '}{restaurant}{' '}
            </span>
            <ul>
              {Object.keys(orders[restaurant]).map((food, i) =>
                <li key={i}>
                  <b> {orders[restaurant][food]} </b> X {food}
                </li>,
              )}{' '}
            </ul>
          </div>,
        )}
    </div>
  );
};

// who ordered what
const WhoOrderedWhat = ({ surveyData = [] }) => {
  const orders = surveyData.map(order => ({
    name: order['Email Address'].split('@')[0].replace(/\./g, ' '),
    meal: order.meal,
    Timestamp: order.Timestamp,
  }));
  const sortByNameCaseInsensitive = R.sortBy(
    R.compose(R.toLower, R.prop('name')),
  );
  const sortedOrders = sortByNameCaseInsensitive(orders);

  return (
    <ol className="who-ordered-what__ol">
      <p className="restaurant-orders__p">
        <b> Who orderd what? </b>
      </p>
      {sortedOrders &&
        sortedOrders.map((order, i) =>
          <li className="who-ordered-what__li" key={i}>
            <span className="who-ordered-what__span"> {order.name}</span>{' '}
            {order.meal} {' '}
            <i className="who-ordered-what__i">
              Ordered on {format(order.Timestamp, 'MMM, Do YYYY')}
            </i>
          </li>,
        )}
    </ol>
  );
};

// a workaround for long mailto links, from https://goo.gl/PT4WXo
const sendEmails = ({ meals, restaurant }) => {
  const timeout = 2000;

  const mailtoPrefix = `mailto:?subject=${restaurant} arrived, your food is here&body=Hello, \n Please find your selected futufriday food at the kitchen. \n Regards, FutuFriday Team&bcc=`;

  const maxUrlCharacters = 1900;
  const separator = ';';
  let currentIndex = 0;
  let nextIndex = 0;
  const emails =
    restaurant && meals[restaurant].map(meal => meal.email).join(';');

  if (!emails) {
    return;
  }

  if (emails.length < maxUrlCharacters) {
    window.location = mailtoPrefix + emails;
    return;
  }

  do {
    currentIndex = nextIndex;
    nextIndex = emails.indexOf(separator, currentIndex + 1);
  } while (nextIndex !== -1 && nextIndex < maxUrlCharacters);

  if (currentIndex === -1) {
    window.location = mailtoPrefix + emails;
  } else {
    window.location = mailtoPrefix + emails.slice(0, currentIndex);
    setTimeout(function() {
      sendEmails(emails.slice(currentIndex + 1));
    }, timeout);
  }
};

const Mailer = ({ surveyData = [] }) => {
  const meals = groupByRestaurants(extractRestaurantNames(surveyData));

  if (R.isEmpty(meals)) return <div />;
  return (
    <div className="mailer__div">
      {meals &&
        <p className="mailer__p">
          Press each button to send an email to the ones who have ordered from
          that restaurant. (opens your email client)
        </p>}
      <div className="mailer__wrapper">
        {meals &&
          Object.keys(meals).map((restaurant, i) =>
            <div key={i}>
              <a
                onClick={() => sendEmails({ meals, restaurant })}
                className="mail-link"
              >
                <b className="restaurant-name">
                  {restaurant.replace('[', '').replace(']', '')}
                </b>{' '}
                Arrived!
              </a>
            </div>,
          )}
      </div>
    </div>
  );
};

const AdminSwitch = ({ checked, handleChange }) => {
  return (
    <label className="switch-light switch-ios">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => {
          handleChange(event);
        }}
      />
      <strong>Admin View</strong>

      <span>
        <span />
        <span role="img" aria-label="admin enabled">
          💪
        </span>
        <a aria-hidden>""</a>
      </span>
    </label>
  );
};

const LatestOrderNotice = ({ surveyData, quantity, clear }) => {
  const latestOrder = getLatestOrder({ orders: surveyData });
  return (
    <div className="latest-order">
      The latest person has ordered on: {' '}
      <b>{format(latestOrder, 'DD/MM/YYYY HH:mm')}</b>
      <br />
      {' Total: '}
      <b>
        {quantity} {' meals'}
      </b>
      <button onClick={clear} className="latest-order__button">
        Upload New CSV file
      </button>
    </div>
  );
};

const ErrorContainer = error => {
  if(!(error.error && error.error.details)) return null;

  return error.error &&
  error.error.details &&
  error.error.details.map((errMessage, i) =>
    <div className="error-container" key={i}>
      <p className="error-container__p">
        <b>Problem with your uploaded .CSV file</b> Error: {errMessage.message}{' '}
        <br />These might help: <br />{' '}
      </p>
      <ul>
        {' '}<li> Make sure the Google form collects email addresses </li>
        <li> Check that the question for food is titled exactly as: meal </li>
        <li>
          {' '}Check that in every meal name, the restaurant name is tagged in
          brackets for example: [Fafa]{' '}
        </li>
        <li> Make sure you uploaded the correct CSV file </li>
        <li> Contact Omid :D </li>
        <li> Contact IT </li>
      </ul>
    </div>,
  )
}

export default App;
