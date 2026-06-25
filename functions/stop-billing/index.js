const functions = require('@google-cloud/functions-framework');
const { CloudBillingClient } = require('@google-cloud/billing');

const billingClient = new CloudBillingClient();

functions.cloudEvent('stopBilling', async (cloudEvent) => {
  // 1. 解析來自 Pub/Sub 的預算資料
  const base64Data = cloudEvent.data.message.data;
  const jsonString = Buffer.from(base64Data, 'base64').toString();
  const budgetData = JSON.parse(jsonString);

  const costAmount = budgetData.costAmount;   // 目前花費
  const budgetAmount = budgetData.budgetAmount; // 預算上限
  const projectId = process.env.GOOGLE_CLOUD_PROJECT; // 當前專案 ID

  console.log(`專案 ${projectId} 當前花費: ${costAmount}, 預算上限: ${budgetAmount}`);

  // 2. 判斷是否真的超過預算（防誤觸）
  if (costAmount >= budgetAmount) {
    console.log(`[警告] 已超出預算！啟動自動斷電機制...`);

    const projectName = `projects/${projectId}`;
    try {
      // 3. 將計費帳戶名稱改為空字串，解除與計費帳戶的連結
      await billingClient.updateProjectBillingInfo({
        name: projectName,
        projectBillingInfo: { billingAccountName: '' } // 核心：設為空字串
      });
      console.log(`[成功] 已成功將專案 ${projectId} 移出計費帳戶！`);
    } catch (error) {
      console.error(`[錯誤] 無法解除計費帳戶連結:`, error);
    }
  } else {
    console.log(`未達預算上限，不執行任何動作。`);
  }
});
