import logo from '../assets/logo.svg'

function Header() {
  return (
    <div className="bg-indigo-900 h-25 w-[100%] flex items-center justify-between px-15">
      {/* bg-indigo-900 */}
      <img src={logo} alt="logo" className='h-20'/>
      <p className="font-semibold text-4xl text-white">Robo<span className='text-[rgb(232,156,56)]'>Nav</span></p>
    </div>
  );
}

export default Header;