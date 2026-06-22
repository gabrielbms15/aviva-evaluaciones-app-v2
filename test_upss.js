const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://iwcewtrekqnmfmjkxwrz.supabase.co', 'sb_publishable_v-x_xogO2r_lCNx_WxheWw_KXI28jkL');

async function main() {
  const { data, error } = await supabase.from('upss').select('*').limit(5);
  console.log(data);
  console.log(error);
}
main();
