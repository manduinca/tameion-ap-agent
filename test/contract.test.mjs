import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,id} from 'ethers';
import {compile} from '../scripts/build.mjs';
compile();
const artifact=name=>JSON.parse(fs.readFileSync(new URL('../build/'+name+'.json',import.meta.url)));

test('treasury enforces roles, duplicate keys, approvals, budgets and transfer rollback on an EVM',async()=>{
  const rpc=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai'},wallet:{totalAccounts:7}});
  const provider=new BrowserProvider(rpc);provider.pollingInterval=10;
  try{
    const [owner,operator,vendor,attacker]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
    const mock=artifact('MockUSDC'), treasury=artifact('APTreasury');
    const token=await new ContractFactory(mock.abi,mock.bytecode,owner).deploy();await token.waitForDeployment();
    const t=await new ContractFactory(treasury.abi,treasury.bytecode,owner).deploy(await token.getAddress(),await owner.getAddress(),await operator.getAddress(),[await vendor.getAddress()],[id('saas'),id('infrastructure')],[500000n,150000n],100000n,300000n,600000n);
    await t.waitForDeployment();await (await token.mint(await t.getAddress(),2000000n)).wait();
    const args=(ref,amount=100000n,category=id('saas'),dest=null)=>[id(ref),dest||vendor.address,amount,category,id('rationale')];
    await assert.rejects(t.connect(attacker).pay.staticCall(...args('unauthorized')));
    await assert.rejects(t.connect(operator).approve.staticCall(id('x'),vendor.address,200000n,id('saas')));
    await assert.rejects(t.connect(operator).pay.staticCall(...args('unknown',100n,id('saas'),attacker.address)));
    await assert.rejects(t.connect(operator).pay.staticCall(...args('too-large',300001n)));
    await assert.rejects(t.connect(operator).pay.staticCall(...args('approval',200000n)));
    await (await t.approve(id('approval'),vendor.address,200000n,id('saas'))).wait();
    await assert.rejects(t.connect(operator).pay.staticCall(...args('approval',200001n)));
    await (await t.connect(operator).pay(...args('approval',200000n))).wait();
    assert.equal(await t.paid(id('approval')),true);
    await assert.rejects(t.connect(operator).pay.staticCall(...args('approval',200000n)));
    await (await t.connect(operator).pay(...args('normal'))).wait();
    assert.equal(await token.balanceOf(vendor.address),300000n);
    await (await t.connect(operator).pay(...args('infra-1',100000n,id('infrastructure')))).wait();
    await assert.rejects(t.connect(operator).pay.staticCall(...args('infra-2',100000n,id('infrastructure'))));
    await (await token.setFailTransfer(true)).wait();
    await assert.rejects(t.connect(operator).pay.staticCall(...args('failed',100000n)));
    assert.equal(await t.paid(id('failed')),false);
    await (await token.setFailTransfer(false)).wait();
    await (await t.connect(operator).pay(...args('normal-2'))).wait();
    await (await t.connect(operator).pay(...args('normal-3'))).wait();
    await assert.rejects(t.connect(operator).pay.staticCall(...args('budget-exceeded',100n,id('infrastructure'))));
    // Fixed 30-day budget resets; invoice replay protection does not.
    await rpc.request({method:'evm_increaseTime',params:[31*86400]});await rpc.request({method:'evm_mine',params:[]});
    await (await t.connect(operator).pay(...args('new-period'))).wait();
    await assert.rejects(t.connect(operator).pay.staticCall(...args('normal')));
  }finally{await provider.destroy();await rpc.disconnect();}
});
