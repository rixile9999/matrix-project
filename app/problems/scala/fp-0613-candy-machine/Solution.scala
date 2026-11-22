def update(i: Input)(m: Machine): Machine = (i, m) match
  case (_, Machine(_, 0, _)) => m
  case (Input.Coin, Machine(true, candies, coins)) => Machine(false, candies, coins + 1)
  case (Input.Turn, Machine(false, candies, coins)) => Machine(true, candies - 1, coins)
  case _ => m

def simulateMachine(inputs: List[Input]): State[Machine, Int] =
  for
    _ <- sequence(inputs.map(i => modify[Machine](update(i))))
    m <- get
  yield m.coins
