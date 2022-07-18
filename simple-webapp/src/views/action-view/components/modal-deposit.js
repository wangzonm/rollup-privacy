import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import {
  Button, Modal, Form, Icon,
} from 'semantic-ui-react';

import ModalError from './modal-error';
import { handleSendDeposit } from '../../../state/tx/actions';

const web3 = require('web3');

class ModalDeposit extends Component {
    static propTypes = {
      wallet: PropTypes.object.isRequired,
      config: PropTypes.object.isRequired,
      abiRollup: PropTypes.array.isRequired,
      password: PropTypes.string.isRequired,
      modalDeposit: PropTypes.bool.isRequired,
      toggleModalDeposit: PropTypes.func.isRequired,
      handleSendDeposit: PropTypes.func.isRequired,
      getInfoAccount: PropTypes.func.isRequired,
    }

    constructor(props) {
      super(props);
      this.amountRef = React.createRef();
      this.tokenIdRef = React.createRef();
      this.state = {
        modalError: false,
        error: "",
      }
    }

    toggleModalError = () =>  { this.setState((prev) => ({ modalError: !prev.modalError })); }

    handeClick = async () => {
      const {
        wallet, config, abiRollup, password,
      } = this.props;
      let amount;
      try {
        amount = web3.utils.toWei(this.amountRef.current.value, 'ether');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(err);
        amount = 0;
      }
      const tokenId = Number(this.tokenIdRef.current.value);
      const { nodeEth } = config;
      const addressSC = config.address;
      if (parseInt(amount,10) > parseInt(this.props.tokensA,10)) {
        this.setState({error:"0"});
        this.toggleModalError();
      } else {
        this.props.toggleModalDeposit();
        const res = await this.props.handleSendDeposit(nodeEth, addressSC, amount, tokenId, wallet,
          password, undefined, abiRollup, this.props.gasMultiplier);
        this.props.getInfoAccount();
        if(res.message !== undefined){
          if(res.message.includes("insufficient funds")){
            this.setState({error:"1"});
            this.toggleModalError();
          }
        }
      }
    }

    render() {
      return (
        <div>
          <ModalError
            error={this.state.error}
            modalError={this.state.modalError}
            toggleModalError={this.toggleModalError} />
          <Modal open={this.props.modalDeposit}>
            <Modal.Header>Deposit</Modal.Header>
            <Modal.Content>
              <Form>
                <Form.Field>
                  <label htmlFor="amount">
                    Amount
                    <input type="text" ref={this.amountRef} id="amount" />
                  </label>
                </Form.Field>
                <Form.Field>
                  <label htmlFor="token-id">
                    Token ID
                    <input type="text" disabled ref={this.tokenIdRef} id="token-id" defaultValue="0" />
                  </label>
                </Form.Field>
              </Form>
            </Modal.Content>
            <Modal.Actions>
              <Button color="blue" onClick={this.handeClick}>
                <Icon name="sign-in" />
                Deposit
              </Button>
              <Button color="red" onClick={this.props.toggleModalDeposit}>
                <Icon name="close" />
                Close
              </Button>
            </Modal.Actions>
          </Modal>
        </div>
      );
    }
}

const mapStateToProps = (state) => ({
  wallet: state.general.wallet,
  config: state.general.config,
  abiRollup: state.general.abiRollup,
  password: state.general.password
});

export default connect(mapStateToProps, { handleSendDeposit })(ModalDeposit);
