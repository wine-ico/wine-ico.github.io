const ssc = new SSC('https://api.hive-engine.com/rpc/');
let user_purchased = '0';
let user_remaining = '0';
let user_balance = '0';
let total_purchased = '0';
let current_user = null;
let current_price_range;

function n(x) {
  return x.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ",");
}

async function load () {
  let ico_status = await axios.get('https://wine-token.herokuapp.com/ico/ico_status');
  if (ico_status.data.purchased) total_purchased = ico_status.data.purchased;

  $('#limit').text(n(limit));
  $('#user_limit').text(`| ${limit_per_user} WINE`);
  $('#total_purchased').text(n(BigNumber(total_purchased).toFixed(0)));
  const percent_filled = BigNumber(total_purchased)
    .multipliedBy(100)
    .dividedBy(limit);
  $('#p-bar').attr('style', `width: ${percent_filled}%;`);
  $('#phase').text(phase);

  $('#ranges').html('');
  $('#prices').html('');
  if (BigNumber(total_purchased).eq(0)) current_price_range = prices[0];
  for (let i = 0; i < prices.length; i += 1) {
    const range = prices[i];

    if (BigNumber(total_purchased).gt(range.from)
      && BigNumber(total_purchased).lte(range.to)) {
      current_price_range = range;
    }

    $('#ranges').append(
      `<span ${current_price_range === range ? 'class="text-danger"' : ''}>${n(range.from)} - ${n(range.to)}</span>`
    );
    $('#prices').append(
      `<span class="num ${current_price_range === range ? 'text-danger' : ''}">| ${range.price}</span>`
    );
  }

  $('#loading').addClass('d-none');
  $('#loading').removeClass('d-flex');
  $('#body').addClass('d-flex');
  $('#body').removeClass('d-none');
}

$(window).bind('load', load);

async function load_user () {
  const username = $('#username').val();
  current_user = null;

  if (!username) return;
  $(this).attr('disabled', '');
  $('#username').attr('disabled', '');
  const account = await ssc.findOne('tokens', 'balances', {
    account: username,
    symbol: 'SWAP.HIVE'
  });

  if (!account) {
    $(this).removeAttr('disabled');
    $('#username').removeAttr('disabled');
    return;
  }

  current_user = username;
  user_balance = account.balance;

  let user_status = await axios.get(`https://wine-token.herokuapp.com/ico/${username}`);
  if (user_status.data.purchased) user_purchased = user_status.data.purchased;

  user_remaining = BigNumber(limit_per_user).minus(user_purchased);

  $('#user_purchased').text(`| ${user_purchased} WINE`);
  $('#user_remaining').text(`| ${user_remaining} WINE`);
  $('#user_balance').text(`| ${user_balance} SWAP.HIVE`);
  if (!BigNumber(total_purchased).gte(limit)) {
    $('#quantity_hive').removeAttr('disabled');
    $('#quantity_wine').removeAttr('disabled');
  }
}

$(document).on('click', '#load', load_user);

function calculateWine () {
  $('#buy').attr('disabled', '');
  const hive = $('#quantity_hive').val();
  if (!BigNumber(hive).gt(0)) return;

  let tokens = BigNumber(hive)
    .dividedBy(current_price_range.price)
    .toFixed(8);
  const purchased_after_this = BigNumber(tokens).plus(total_purchased);

  if (BigNumber(purchased_after_this).gt(current_price_range.to)) {
    const remainingInThisPriceRange = BigNumber(current_price_range.to)
      .minus(total_purchased)
      .toFixed(8);

    const priceForRemainingTokens = BigNumber(remainingInThisPriceRange)
      .multipliedBy(current_price_range.price)
      .toFixed(8);

    const quantityOverPriceRange = BigNumber(hive)
      .minus(priceForRemainingTokens)
      .toFixed(8);

    // now from the leftover quantity calculate with the next price range
    const nextPriceRange = prices[current_price_range.id + 1];
    if (nextPriceRange) {
      toBuyInNextRange = BigNumber(quantityOverPriceRange)
        .dividedBy(nextPriceRange.price)
        .toFixed(8);

      // total number of tokens to buy
      tokens = BigNumber(remainingInThisPriceRange)
        .plus(toBuyInNextRange)
        .toFixed(8)
        .toString();
    }
  }

  $('#quantity_wine').val(parseFloat(tokens));
  if (BigNumber(user_remaining).gte(tokens)
    && BigNumber(user_balance).gte(hive)
    && BigNumber(tokens).gt(0.00000001)) {
    $('#buy').removeAttr('disabled');
  }
}

$(document).on('change', '#quantity_hive', calculateWine);
$(document).on('keyup', '#quantity_hive', calculateWine);

function calculateHive () {
  $('#buy').attr('disabled', '');
  const wine = $('#quantity_wine').val();
  if (!BigNumber(wine).gt(0)) return;

  let price = BigNumber(wine)
    .multipliedBy(current_price_range.price)
    .toFixed(8);
  
  const purchased_after_this = BigNumber(wine).plus(total_purchased);
  if (BigNumber(purchased_after_this).gt(current_price_range.to)) {
    const remainingInThisPriceRange = BigNumber(current_price_range.to)
      .minus(total_purchased)
      .toFixed(8);
    
    const priceForRemainingTokens = BigNumber(remainingInThisPriceRange)
      .multipliedBy(current_price_range.price)
      .toFixed(8);

    const nextPriceRange = prices[current_price_range.id + 1];
    if (nextPriceRange) {
      const tokensOverPriceRange = BigNumber(wine)
        .minus(remainingInThisPriceRange)
        .toFixed(8);
      const priceForNextRange = BigNumber(tokensOverPriceRange)
        .multipliedBy(nextPriceRange.price)
        .toFixed(8);
      
      price = BigNumber(priceForRemainingTokens)
        .plus(priceForNextRange);
    }
  }

  $('#quantity_hive').val(parseFloat(price));
  if (BigNumber(user_remaining).gte(wine)
    && BigNumber(user_balance).gte(price)
    && BigNumber(price).gt(0.00000001)) {
    $('#buy').removeAttr('disabled');
  }
}

$(document).on('change', '#quantity_wine', calculateHive);
$(document).on('keyup', '#quantity_wine', calculateHive);

$(document).on('click', '#buy', async function () {
  $('#loading').addClass('d-flex');
  $('#loading').removeClass('d-none');
  $('#body').addClass('d-none');
  $('#body').removeClass('d-flex');
  let previous_total_purchased = total_purchased;
  await load();

  const wine = $('#quantity_wine').val();
  const purchased_after_this = BigNumber(total_purchased).plus(wine);
  if (BigNumber(purchased_after_this).gt(limit)) {
    alert('Quantity exceeds ICO limit');
    return;
  }

  if (BigNumber(total_purchased).gte(limit)) {
    $('#buy').attr('disabled', '');
    $('#quantity_hive').attr('disabled', '');
    $('#quantity_wine').attr('disabled', '');
    alert('ICO has been completed.');
    return;
  }

  await load_user();

  if (previous_total_purchased !== total_purchased) {
    calculateWine();
    alert('ICO status has been updated, Press Buy again');
    return;
  }

  const amount = $('#quantity_hive').val();

  if (!window.hive_keychain) {
    alert('Please Install Hive Keychain');
    return;
  }

  const obj = {
    'contractName': 'tokens',
    'contractAction': 'transfer',
    'contractPayload': {
      'symbol': 'SWAP.HIVE',
      'to': ico_account,
      'quantity': amount.toString(),
      'memo': `Buy Staked WINE from ICO ${phase}`
    }
  };

  window.hive_keychain.requestCustomJson(
    current_user,
    'ssc-mainnet-hive',
    'active',
    JSON.stringify(obj),
    `Buy Staked WINE from ICO ${phase}`,
    async function (response) {
      if (response.success) {
        alert(`Successfully Bought Staked WINE from ICO ${phase}`);
        $('#loading').addClass('d-flex');
        $('#loading').removeClass('d-none');
        $('#body').addClass('d-none');
        $('#body').removeClass('d-flex');

        let result = null;
        do {
          result = await ssc.getTransactionInfo(response.result.id);
        } while (result === null);

        setTimeout(function () {
          location.reload();
        }, 3000);
      } else {
        alert('An Error Occured, Please Try Again');
      }
    }
  );
});
