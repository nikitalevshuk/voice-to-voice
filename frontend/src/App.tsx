import { ChakraProvider, Container, VStack } from '@chakra-ui/react'
import ChatInterface from './components/ChatInterface'

function App() {
  return (
    <ChakraProvider>
      <Container maxW="container.md" py={10}>
        <VStack spacing={8}>
          <ChatInterface />
        </VStack>
      </Container>
    </ChakraProvider>
  )
}

export default App
